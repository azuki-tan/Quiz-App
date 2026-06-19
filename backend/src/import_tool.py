import os
import time
import requests
import json
import sys
import io
import base64
from PIL import ImageGrab, Image

# Default values
SERVER_URL = "http://10.9.0.2:8080"
API_TOKEN = ""
QUIZ_ID = ""
MODEL_NAME = "gemini/gemini-1.5-flash"

def load_config():
    global SERVER_URL, API_TOKEN, QUIZ_ID, MODEL_NAME
    config_file = "config.json"
    if os.path.exists(config_file):
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                SERVER_URL = cfg.get("server_url", SERVER_URL)
                API_TOKEN = cfg.get("api_token", API_TOKEN)
                QUIZ_ID = cfg.get("quiz_id", QUIZ_ID)
                MODEL_NAME = cfg.get("model", MODEL_NAME)
            print(f"[ĐÃ TẢI CẤU HÌNH] Kết nối: {SERVER_URL}, Bộ đề ID: {QUIZ_ID}, Model: {MODEL_NAME}")
            return True
        except Exception as e:
            print(f"Không thể đọc file cấu hình config.json: {e}")
    return False

def save_config():
    config_file = "config.json"
    try:
        with open(config_file, "w", encoding="utf-8") as f:
            json.dump({
                "server_url": SERVER_URL,
                "api_token": API_TOKEN,
                "quiz_id": int(QUIZ_ID) if str(QUIZ_ID).isdigit() else QUIZ_ID,
                "model": MODEL_NAME
            }, f, indent=4)
        print("[ĐÃ LƯU] Cập nhật file cấu hình config.json.")
    except Exception as e:
        print(f"Không thể lưu file cấu hình: {e}")

def get_image_from_clipboard():
    try:
        # PIL native clipboard grabber
        img = ImageGrab.grabclipboard()
        if isinstance(img, Image.Image):
            return img
    except Exception as e:
        pass
    return None

def analyze_image_via_server(img, model):
    # Convert image to base64
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
    
    url = f"{SERVER_URL}/api/ai/analyze-image"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_TOKEN}"
    }
    payload = {
        "imageBase64": img_base64,
        "model": model
    }
    
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code != 200:
        raise Exception(f"Server API Error (Mã {response.status_code}): {response.text}")
        
    return response.json()

def save_question_to_server(q_data, quiz_id):
    answers_list = []
    for idx, ans in enumerate(q_data['answers']):
        answers_list.append({
            "id": 0,
            "content": ans['content'],
            "isCorrect": ans['isCorrect'],
            "indexOrder": idx,
            "questionTargetId": 0
        })
        
    # Standardize to 4 options
    while len(answers_list) < 4:
        answers_list.append({
            "id": 0,
            "content": "",
            "isCorrect": False,
            "indexOrder": len(answers_list),
            "questionTargetId": 0
        })
        
    payload = {
        "content": q_data['question'],
        "explanation": q_data['explanation'],
        "imageUrl": None,
        "explanationImage": None,
        "quizTargetId": int(quiz_id),
        "answersList": answers_list
    }
    
    url = f"{SERVER_URL}/api/questions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_TOKEN}"
    }
    
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code not in (200, 201):
        raise Exception(f"Lỗi lưu câu hỏi (Mã {response.status_code}): {response.text}")
    return response.json()

def run_clipboard_importer():
    print("\n--- CHẾ ĐỘ 1: THEO DÕI CLIPBOARD THỜI GIAN THỰC ---")
    print("Mẹo: Hãy dùng Win + Shift + S chụp ảnh câu hỏi.")
    print("Hệ thống phát hiện ảnh trong clipboard sẽ tự phân tích và lưu vào DB.")
    print("Nhấn Ctrl + C để quay lại menu chính.\n")
    
    last_img_bytes = None
    
    while True:
        try:
            img = get_image_from_clipboard()
            if img:
                # Convert image to comparison bytes to detect changes
                buffered = io.BytesIO()
                img.save(buffered, format="PNG")
                img_bytes = buffered.getvalue()
                
                # Check if it's a new screenshot
                if last_img_bytes is None or img_bytes[:100] != last_img_bytes[:100]:
                    print("\n[CLIPBOARD] Phát hiện ảnh mới! Đang gửi AI phân tích...")
                    last_img_bytes = img_bytes
                    
                    q_data = analyze_image_via_server(img, MODEL_NAME)
                    print(f"-> Câu hỏi: {q_data['question'][:80]}...")
                    for a in q_data['answers']:
                        print(f"   [{'x' if a['isCorrect'] else ' '}] {a['content']}")
                        
                    res = save_question_to_server(q_data, QUIZ_ID)
                    print(f"-> [THÀNH CÔNG] Đã lưu vào bộ đề, ID câu hỏi: {res.get('id')}")
            else:
                # If clipboard contains text or is empty, reset comparison cache
                last_img_bytes = None
        except KeyboardInterrupt:
            print("\nDừng chế độ theo dõi clipboard.")
            break
        except Exception as e:
            print(f"-> [LỖI] {e}")
            
        time.sleep(1.0)

def run_folder_importer():
    print("\n--- CHẾ ĐỘ 2: NHẬP HÀNG LOẠT TỪ THƯ MỤC ẢNH ---")
    folder_path = input("Nhập đường dẫn thư mục chứa ảnh (hoặc Enter để quét thư mục hiện tại): ").strip()
    if not folder_path:
        folder_path = "."
        
    if not os.path.exists(folder_path):
        print("Đường dẫn không tồn tại.")
        return
        
    valid_exts = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
    files = [f for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]
    
    if not files:
        print("Không tìm thấy tệp ảnh nào.")
        return
        
    print(f"Tìm thấy {len(files)} tệp ảnh. Bắt đầu import...")
    for idx, filename in enumerate(files):
        path = os.path.join(folder_path, filename)
        print(f"\n[{idx+1}/{len(files)}] Đang xử lý: {filename}...")
        try:
            img = Image.open(path)
            q_data = analyze_image_via_server(img, MODEL_NAME)
            print(f"-> Câu hỏi: {q_data['question'][:80]}...")
            for a in q_data['answers']:
                print(f"   [{'x' if a['isCorrect'] else ' '}] {a['content']}")
            res = save_question_to_server(q_data, QUIZ_ID)
            print(f"-> [THÀNH CÔNG] Đã lưu, ID: {res.get('id')}")
            time.sleep(2.0) # sleep to avoid overloading LiteLLM/Gemini API
        except Exception as e:
            print(f"-> [LỖI] Thất bại khi xử lý {filename}: {e}")
    print("\nHoàn tất import thư mục.")

def main():
    global SERVER_URL, API_TOKEN, QUIZ_ID, MODEL_NAME
    
    print("=" * 60)
    print("   AI CLIPBOARD & FOLDER AUTO-IMPORT TOOL FOR QUIZ APP")
    print("=" * 60)
    
    has_config = load_config()
    
    # Prompt user if config doesn't exist or is invalid
    if not SERVER_URL:
        SERVER_URL = input("Nhập URL Server (mặc định: http://10.9.0.2:8080): ").strip() or "http://10.9.0.2:8080"
    if not API_TOKEN:
        API_TOKEN = input("Nhập API Token lấy từ web: ").strip()
    if not QUIZ_ID:
        QUIZ_ID = input("Nhập ID Bộ Đề (Quiz ID) cần import: ").strip()
    if not MODEL_NAME:
        MODEL_NAME = input("Nhập tên Model AI sử dụng: ").strip() or "gemini/gemini-1.5-flash"
        
    if not has_config:
        save_config()
        
    while True:
        print("\n=== MENU CHÍNH ===")
        print("1. Chạy Auto-Import từ Clipboard (Chụp ảnh màn hình là import)")
        print("2. Chạy Batch-Import từ thư mục ảnh")
        print("3. Thay đổi cấu hình (Server, Token, Quiz ID, Model)")
        print("4. Thoát")
        
        choice = input("Chọn chức năng (1-4): ").strip()
        if choice == "1":
            run_clipboard_importer()
        elif choice == "2":
            run_folder_importer()
        elif choice == "3":
            SERVER_URL = input(f"Server URL ({SERVER_URL}): ").strip() or SERVER_URL
            API_TOKEN = input(f"API Token ({API_TOKEN[:15]}...): ").strip() or API_TOKEN
            QUIZ_ID = input(f"Quiz ID ({QUIZ_ID}): ").strip() or QUIZ_ID
            MODEL_NAME = input(f"Model ({MODEL_NAME}): ").strip() or MODEL_NAME
            save_config()
        elif choice == "4":
            print("Tạm biệt!")
            sys.exit(0)
        else:
            print("Lựa chọn không hợp lệ, vui lòng chọn lại.")

if __name__ == "__main__":
    main()
