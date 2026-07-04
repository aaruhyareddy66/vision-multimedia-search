from flask import Flask, request, jsonify
import cv2
import numpy as np
import pytesseract
import os
from ultralytics import YOLO
from dotenv import load_dotenv

load_dotenv()

TESSERACT_PATH = os.getenv('TESSERACT_PATH', r'C:\Program Files\Tesseract-OCR\tesseract.exe')
FLASK_PORT = int(os.getenv('FLASK_PORT', 5001))
CONFIDENCE_THRESHOLD = float(os.getenv('YOLO_CONFIDENCE_THRESHOLD', 0.4))

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

app = Flask(__name__)

print("Loading YOLOv8 model...")
yolo_model = YOLO('yolov8n.pt')
print("YOLOv8 model loaded.")


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'service': 'python-processing',
        'yolo_loaded': yolo_model is not None
    })


@app.route('/process', methods=['POST'])
def process_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    filepath = os.path.join(os.getcwd(), file.filename)

    try:
        file.save(filepath)

        img = cv2.imread(filepath)
        if img is None:
            return jsonify({'error': 'Could not read image — unsupported or corrupt file'}), 400

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        try:
            extracted_text = pytesseract.image_to_string(gray).strip()
        except Exception as ocr_err:
            print(f"OCR error: {ocr_err}")
            extracted_text = ''

        try:
            results = yolo_model(img, verbose=False)
            objects_detected = []
            for result in results:
                for box in result.boxes:
                    class_id = int(box.cls[0])
                    label = yolo_model.names[class_id]
                    confidence = float(box.conf[0])
                    if confidence > CONFIDENCE_THRESHOLD:
                        objects_detected.append(label)
        except Exception as yolo_err:
            print(f"YOLO detection error: {yolo_err}")
            objects_detected = []

        height, width = img.shape[:2]
        avg_color = img.mean(axis=(0, 1)).tolist()

        return jsonify({
            'filename': file.filename,
            'ocr_text': extracted_text,
            'objects_detected': objects_detected,
            'width': width,
            'height': height,
            'avg_color_bgr': avg_color
        })

    except Exception as e:
        print(f"Processing error: {e}")
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


if __name__ == '__main__':
    app.run(port=FLASK_PORT, debug=True)