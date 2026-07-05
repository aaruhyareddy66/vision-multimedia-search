require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { Client } = require('@opensearch-project/opensearch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const NODE_PORT = process.env.NODE_PORT || 3000;
const PYTHON_SERVICE_URL = `${process.env.PYTHON_SERVICE_URL || 'http://localhost:5001'}/process`;
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

const esClient = new Client({ node: ELASTICSEARCH_URL });
const INDEX_NAME = 'media_files';

async function setupIndex() {
  try {
    const exists = await esClient.indices.exists({ index: INDEX_NAME });
    if (!exists.body) {
      await esClient.indices.create({
        index: INDEX_NAME,
        body: {
          mappings: {
            properties: {
              filename: { type: 'text' },
              ocr_text: { type: 'text' },
              objects_detected: { type: 'keyword' },
              width: { type: 'integer' },
              height: { type: 'integer' },
              upload_date: { type: 'date' }
            }
          }
        }
      });
      console.log(`Index "${INDEX_NAME}" created`);
    } else {
      console.log(`Index "${INDEX_NAME}" already exists`);
    }
  } catch (err) {
    console.error('Failed to set up Elasticsearch index:', err.message);
  }
}
setupIndex();

app.get('/health', async (req, res) => {
  const health = { node: 'ok', elasticsearch: 'unknown', python: 'unknown' };

  try {
    await esClient.ping();
    health.elasticsearch = 'ok';
  } catch {
    health.elasticsearch = 'unreachable';
  }

  try {
    const pyHealthUrl = PYTHON_SERVICE_URL.replace('/process', '/health');
    await axios.get(pyHealthUrl, { timeout: 3000 });
    health.python = 'ok';
  } catch {
    health.python = 'unreachable';
  }

  const allOk = Object.values(health).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json(health);
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file received' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), originalName);

    const pyResponse = await axios.post(PYTHON_SERVICE_URL, form, {
      headers: form.getHeaders(),
      timeout: 60000
    });

    const metadata = pyResponse.data;

    if (metadata.error) {
      return res.status(422).json({ error: `Processing error: ${metadata.error}` });
    }

    const esResult = await esClient.index({
      index: INDEX_NAME,
      body: {
        filename: metadata.filename,
        ocr_text: metadata.ocr_text,
        objects_detected: metadata.objects_detected,
        width: metadata.width,
        height: metadata.height,
        upload_date: new Date()
      }
    });

    res.json({ success: true, id: esResult.body._id, metadata });

  } catch (err) {
    console.error('Upload error:', err.message);
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Python processing service is not reachable. Is it running on port 5001?' });
    }
    res.status(500).json({ error: err.message });

  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

app.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const results = await esClient.search({
      index: INDEX_NAME,
      body: {
        query: q
          ? { multi_match: { query: q, fields: ['filename', 'ocr_text', 'objects_detected'] } }
          : { match_all: {} }
      }
    });

    const hits = results.body.hits.hits.map(h => ({ id: h._id, ...h._source }));
    res.json(hits);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/files', async (req, res) => {
  try {
    const results = await esClient.search({
      index: INDEX_NAME,
      body: {
        size: 100,
        query: { match_all: {} },
        sort: [{ upload_date: 'desc' }]
      }
    });
    const hits = results.body.hits.hits.map(h => ({ id: h._id, ...h._source }));
    res.json(hits);
  } catch (err) {
    console.error('List error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/files/:id', async (req, res) => {
  try {
    await esClient.delete({ index: INDEX_NAME, id: req.params.id });
    res.json({ success: true, deleted: req.params.id });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(404).json({ error: 'File not found or already deleted' });
  }
});

app.listen(NODE_PORT, () => console.log(`Node service running on http://localhost:${NODE_PORT}`));