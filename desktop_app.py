import os
import sys
import json
import time
import base64
import io
import re
import threading
import html
import pyautogui
import tkinter as tk
from tkinter import messagebox, filedialog, ttk
import requests
from PIL import Image, ImageGrab, ImageTk

# Color Scheme (Premium Light Theme - Tailwind Slate style)
BG_DARK = "#F8FAFC"        # Light gray background (slate-50)
BG_CARD = "#FFFFFF"        # White for cards and panels
BG_INPUT = "#F1F5F9"       # Very light slate for inputs (slate-100)
FG_TEXT = "#0F172A"        # Deep slate for main text (slate-900)
FG_GRAY = "#475569"        # Slate gray for secondary labels (slate-600)
BTN_PRIMARY = "#0284C7"    # Primary blue (sky-600)
BTN_SUCCESS = "#16A34A"    # Success green (green-600)
BTN_DANGER = "#DC2626"     # Danger red (red-600)
BTN_SECONDARY = "#64748B"  # Secondary slate (slate-500)
BORDER_COLOR = "#E2E8F0"   # Light border (slate-200)
HIGHLIGHT_COLOR = "#E0F2FE" # Light blue highlight background (sky-100)

FG_WHITE = "#FFFFFF"

# ==========================================
# CỖ MÁY SỬA LỖI & DỌN RÁC JSON (BẤT TỬ)
# ==========================================
def repair_and_parse_json(ai_text):
    import re, json
    
    # 1. Trích xuất lõi JSON
    match = re.search(r'\{.*\}', ai_text, re.DOTALL)
    if match:
        ai_text = match.group(0)

    # 2. Quét từng ký tự để bắt lỗi xuống dòng bên trong ngoặc kép
    in_string = False
    escaped = False
    repaired_chars = []
    for char in ai_text:
        if char == '"' and not escaped:
            in_string = not in_string
        
        if char == '\\' and not escaped:
            escaped = True
        else:
            escaped = False
            
        if in_string and char == '\n': repaired_chars.append('\\n')
        elif in_string and char == '\r': repaired_chars.append('\\r')
        elif in_string and char == '\t': repaired_chars.append('\\t')
        else: repaired_chars.append(char)
            
    repaired_json = "".join(repaired_chars)
    repaired_json = re.sub(r',\s*([\]}])', r'\1', repaired_json)
    
    return json.loads(repaired_json)

def clean_html_explanation(html_str):
    if not html_str: return ""
    html_str = re.sub(r'<style[^>]*>.*?</style>', '', html_str, flags=re.DOTALL)
    html_str = re.sub(r'<script[^>]*>.*?</script>', '', html_str, flags=re.DOTALL)
    
    html_str = re.sub(r'\\\(\s*', '', html_str)
    html_str = re.sub(r'\s*\\\)', '', html_str)
    html_str = re.sub(r'\\\[\s*', '', html_str)
    html_str = re.sub(r'\s*\\\]', '', html_str)
    
    latex_to_unicode = {
        r'\\times': '×', r'\\div': '÷', r'\\rightarrow': '→', r'\\leftarrow': '←',
        r'\\pmod\s*\{([^}]+)\}': r'mod \1', r'\\pmod\s*': 'mod ', r'\\equiv': '≡',
        r'\\approx': '≈', r'\\leq?': '≤', r'\\geq?': '≥', r'\\neq': '≠',
        r'\\pm': '±', r'\\infty': '∞', r'\\cdot': '·',
    }
    for pattern, replacement in latex_to_unicode.items():
        html_str = re.sub(pattern, replacement, html_str)
        
    html_str = re.sub(r'_\{([a-zA-Z0-9]+)\}', r'_\1', html_str)
    html_str = re.sub(r'\^\{([a-zA-Z0-9]+)\}', r'^\1', html_str)
    html_str = re.sub(r'_\{([^}]+)\}', r'_(\1)', html_str)
    html_str = re.sub(r'\^\{([^}]+)\}', r'^(\1)', html_str)

    html_str = re.sub(r'<br\s*/?>', '\n', html_str, flags=re.IGNORECASE)
    html_str = re.sub(r'</p>', '\n\n', html_str, flags=re.IGNORECASE)
    html_str = re.sub(r'<li[^>]*>', '\n• ', html_str, flags=re.IGNORECASE)
    
    html_str = re.sub(r'<b[^>]*>(.*?)</b>', r'**\1**', html_str, flags=re.IGNORECASE | re.DOTALL)
    html_str = re.sub(r'<strong[^>]*>(.*?)</strong>', r'**\1**', html_str, flags=re.IGNORECASE | re.DOTALL)
    html_str = re.sub(r'<code[^>]*>(.*?)</code>', r'`\1`', html_str, flags=re.IGNORECASE | re.DOTALL)
    
    cleaned = re.sub(r'<[^>]+>', '', html_str)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    
    return cleaned.strip()

# ==========================================
# LỚP KẾT NỐI API & AI
# ==========================================
class APIClient:
    def __init__(self, base_url, token):
        self.base_url = base_url.rstrip('/')
        self.token = token

    def _headers(self):
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}"
        }

    def test_connection(self):
        try:
            r = requests.get(f"{self.base_url}/api/auth/me", headers=self._headers(), timeout=5)
            if r.status_code == 200: return r.json()
            return None
        except Exception: return None

    def get_models(self, custom_url=None, custom_key=None):
        headers = self._headers()
        if custom_url:
            headers["X-LiteLLM-URL"] = custom_url
            if custom_key: headers["X-LiteLLM-Key"] = custom_key
        try:
            r = requests.get(f"{self.base_url}/api/ai/models", headers=headers, timeout=5)
            if r.status_code == 200: return r.json()
        except Exception: pass
            
        if custom_url:
            try:
                direct_headers = {}
                if custom_key: direct_headers["Authorization"] = f"Bearer {custom_key}"
                r = requests.get(f"{custom_url}/v1/models", headers=direct_headers, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    return [m['id'] for m in data.get('data', [])]
            except Exception: pass
                
        return ["gemini/gemini-1.5-flash", "openai/gpt-4o-mini"]

    def get_subjects(self):
        r = requests.get(f"{self.base_url}/api/subjects", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def save_subject(self, code, name, subject_id=None):
        payload = {"code": code.upper(), "name": name}
        if subject_id: payload["id"] = subject_id
        r = requests.post(f"{self.base_url}/api/subjects", json=payload, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def delete_subject(self, subject_id):
        r = requests.delete(f"{self.base_url}/api/subjects/{subject_id}", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def get_quizzes(self, subject_id):
        r = requests.get(f"{self.base_url}/api/subjects/{subject_id}/quizzes", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def save_quiz(self, name, subject_id, quiz_id=None):
        payload = {"name": name, "subjectTargetId": subject_id}
        if quiz_id: payload["id"] = quiz_id
        r = requests.post(f"{self.base_url}/api/quizzes", json=payload, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def delete_quiz(self, quiz_id):
        r = requests.delete(f"{self.base_url}/api/quizzes/{quiz_id}", headers=self._headers())
        r.raise_for_status()
        return r.json()

    # ĐÃ FIX: Hàm lấy danh sách câu hỏi chuẩn
    def get_questions(self, quiz_id):
        r = requests.get(f"{self.base_url}/api/quizzes/{quiz_id}/questions", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def save_question(self, question_data):
        r = requests.post(f"{self.base_url}/api/questions", json=question_data, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def delete_question(self, question_id):
        r = requests.delete(f"{self.base_url}/api/questions/{question_id}", headers=self._headers())
        r.raise_for_status()
        return r.json()

    # AI Analyzer cho Ảnh (Clipboard/Bulk)
    def analyze_image(self, img_pil, model, custom_url=None, custom_key=None):
        buffered = io.BytesIO()
        img_copy = img_pil.copy()
        img_copy.thumbnail((1024, 1024))
        if img_copy.mode in ("RGBA", "P"):
            img_copy = img_copy.convert("RGB")
        img_copy.save(buffered, format="JPEG", quality=85)
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

        if custom_url:
            ai_endpoint = custom_url.rstrip('/')
            is_openrouter = "openrouter.ai" in ai_endpoint
            
            if is_openrouter: ai_endpoint = f"{ai_endpoint}/api/v1/chat/completions"
            elif not ai_endpoint.endswith("/chat/completions"): ai_endpoint += "/v1/chat/completions" if not ai_endpoint.endswith("/v1") else "/chat/completions"

            headers = {"Content-Type": "application/json"}
            if custom_key: headers["Authorization"] = f"Bearer {custom_key}"
            if is_openrouter:
                headers["HTTP-Referer"] = "https://github.com/HimemoriAzuki/QuizManager"
                headers["X-Title"] = "Azuki Quiz Console"

            sys_prompt = (
                "Bạn là chuyên gia bóc tách đề thi. Nhiệm vụ:\n"
                "1. Trích xuất chính xác 'Nội dung câu hỏi' (question).\n"
                "2. Trích xuất TẤT CẢ các lựa chọn vào mảng 'answers'.\n"
                "3. Suy luận để tìm ra đáp án ĐÚNG nhất (chuyển isCorrect thành true).\n"
                "4. Viết phần 'explanation' THEO ĐÚNG HTML SAU:\n"
                "<b>✅ Lời giải & Bản chất:</b><br>[1-2 câu giải thích]<br><br>"
                "<b>❌ Bắt lỗi sai:</b><br>[Lý do sai]<br><br>"
                "<b>⚡ Mẹo hack phòng thi:</b><br>[Mẹo nhớ nhanh]\n\n"
                "QUAN TRỌNG: KHÔNG DÙNG ký tự xuống dòng bên trong JSON. Mọi sự xuống dòng BẮT BUỘC dùng thẻ <br>.\n"
                "Schema JSON bắt buộc:\n"
                "{\n"
                '  "question": "string",\n'
                '  "explanation": "chuỗi HTML",\n'
                '  "answers": [\n'
                '    {"content": "string", "isCorrect": boolean}\n'
                "  ]\n"
                "}"
            )

            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": [
                        {"type": "text", "text": "Hãy bóc tách đầy đủ dữ liệu và giải câu hỏi trong ảnh này."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}}
                    ]}
                ],
                "temperature": 0.1
            }
            if is_openrouter: payload["reasoning"] = {"enabled": True}

            r = requests.post(ai_endpoint, json=payload, headers=headers, timeout=60) 
            r.raise_for_status()
            
            msg = r.json()['choices'][0]['message']
            ai_text = msg.get('content') or ''
            
            try:
                # Dùng cỗ máy bất tử để quét và sửa rác JSON
                data = repair_and_parse_json(ai_text.strip())
                if 'explanation' in data:
                    raw_expl = data['explanation']
                    if isinstance(raw_expl, str):
                        clean_expl = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', raw_expl, flags=re.DOTALL)
                        clean_expl = clean_expl.replace('\n', '<br>')
                        data['explanation'] = clean_expl
                return data
            except Exception as e:
                return {
                    "question": "[LỖI BÓC TÁCH AI] Sai định dạng JSON.",
                    "explanation": f"Lý do lỗi: {e}<br>Dữ liệu rác: {ai_text}",
                    "answers": []
                }
                
        # Fallback
        payload = {"imageBase64": img_base64, "model": model}
        r = requests.post(f"{self.base_url}/api/ai/analyze-image", json=payload, headers=self._headers(), timeout=60)
        r.raise_for_status()
        return r.json()

    # ĐÃ FIX: Bổ sung hàm AI Solve bằng Text (Dùng cho Hàng loạt và Editor)
    def solve_text(self, text_content, model, custom_url=None, custom_key=None):
        if custom_url:
            ai_endpoint = custom_url.rstrip('/')
            is_openrouter = "openrouter.ai" in ai_endpoint
            
            if is_openrouter: ai_endpoint += "/api/v1/chat/completions"
            elif not ai_endpoint.endswith("/chat/completions"): ai_endpoint += "/v1/chat/completions" if not ai_endpoint.endswith("/v1") else "/chat/completions"

            headers = {"Content-Type": "application/json"}
            if custom_key: headers["Authorization"] = f"Bearer {custom_key}"
            if is_openrouter:
                headers["HTTP-Referer"] = "https://github.com/HimemoriAzuki/QuizManager"
                headers["X-Title"] = "Azuki Quiz Console"

            sys_prompt = (
                "Bạn là chuyên gia giải đề siêu tốc. Nhiệm vụ:\n"
                "1. Trích xuất TẤT CẢ các lựa chọn (A, B, C, D) vào mảng 'answers'.\n"
                "2. Tìm đáp án ĐÚNG nhất (chuyển isCorrect thành true).\n"
                "3. Viết 'explanation' THEO ĐÚNG HTML SAU:\n"
                "<b>✅ Lời giải & Bản chất:</b><br>[1-2 câu giải thích]<br><br>"
                "<b>❌ Bắt lỗi sai:</b><br>[Lý do sai]<br><br>"
                "<b>⚡ Mẹo hack phòng thi:</b><br>[Mẹo nhớ nhanh]\n\n"
                "QUAN TRỌNG: KHÔNG DÙNG ký tự xuống dòng bên trong JSON. Mọi sự xuống dòng BẮT BUỘC dùng thẻ <br>.\n"
                "Schema JSON bắt buộc:\n"
                "{\n"
                '  "answers": [\n'
                '    {"content": "string", "isCorrect": boolean}\n'
                "  ],\n"
                '  "explanation": "chuỗi HTML"\n'
                "}"
            )

            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": f"Hãy giải câu hỏi sau:\n{text_content}"}
                ],
                "temperature": 0.1
            }
            if is_openrouter: payload["reasoning"] = {"enabled": True}

            r = requests.post(ai_endpoint, json=payload, headers=headers, timeout=60) 
            r.raise_for_status()
            
            msg = r.json()['choices'][0]['message']
            ai_text = msg.get('content') or ''
            
            try:
                data = repair_and_parse_json(ai_text.strip())
                if 'explanation' in data:
                    raw_expl = data['explanation']
                    if isinstance(raw_expl, str):
                        clean_expl = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', raw_expl, flags=re.DOTALL)
                        clean_expl = clean_expl.replace('\n', '<br>')
                        data['explanation'] = clean_expl
                return data
            except Exception as e:
                raise Exception(f"Lỗi AI trả về rác: {e}\n\nRaw Text: {ai_text}")
                
        payload = {"content": text_content, "model": model}
        r = requests.post(f"{self.base_url}/api/ai/solve", json=payload, headers=self._headers(), timeout=60)
        r.raise_for_status()
        return r.json()

# ==========================================
# LỚP GIAO DIỆN CHÍNH
# ==========================================
class QuizManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("E-Learning Quiz Desktop Manager")
        self.root.geometry("1200x780")
        self.root.configure(bg=BG_DARK)

        self.client = None
        self.subjects = []
        self.quizzes = []
        self.questions = []
        
        self.selected_subject_id = None
        self.selected_quiz_id = None
        
        self.clipboard_running = False
        self.last_img_bytes = None

        self.load_local_config()
        self.setup_styles()
        self.build_ui()
        
        if self.server_url and self.api_token:
            self.connect_server(silent=True)

    def load_local_config(self):
        self.server_url = "http://10.9.0.2:8099"
        self.api_token = ""
        self.model_name = "gemini/gemini-1.5-flash"
        self.ai_endpoint = "http://10.9.0.3:8091"
        self.ai_key = "sk-5OGLweafkCDD5swbrPXoNQ"
        
        if os.path.exists("config.json"):
            try:
                with open("config.json", "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    self.server_url = cfg.get("server_url", self.server_url)
                    self.api_token = cfg.get("api_token", self.api_token)
                    self.model_name = cfg.get("model", self.model_name)
                    self.ai_endpoint = cfg.get("ai_endpoint", self.ai_endpoint)
                    self.ai_key = cfg.get("ai_key", self.ai_key)
            except Exception: pass

    def save_local_config(self):
        try:
            with open("config.json", "w", encoding="utf-8") as f:
                json.dump({
                    "server_url": self.server_url, "api_token": self.api_token,
                    "model": self.model_name, "ai_endpoint": self.ai_endpoint, "ai_key": self.ai_key
                }, f, indent=4)
        except Exception: pass

    # ĐÃ FIX: Hàm lấy config AI để truyền vào API
    def get_active_ai_config(self):
        endpoint = self.ent_ai_endpoint.get().strip() if hasattr(self, 'ent_ai_endpoint') else self.ai_endpoint
        key = self.ent_ai_key.get().strip() if hasattr(self, 'ent_ai_key') else self.ai_key
        return endpoint, key

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure(".", background=BG_DARK, foreground=FG_TEXT, font=("Segoe UI", 10))
        style.configure("TFrame", background=BG_DARK)
        
        style.configure("Treeview", background=BG_CARD, foreground=FG_TEXT, fieldbackground=BG_CARD, borderwidth=0, rowheight=28)
        style.map("Treeview", background=[("selected", HIGHLIGHT_COLOR)], foreground=[("selected", FG_TEXT)])
        style.configure("Treeview.Heading", background=BG_INPUT, foreground=FG_TEXT, borderwidth=0, font=("Segoe UI", 10, "bold"))

        style.configure("TNotebook", background=BG_DARK, borderwidth=0)
        style.configure("TNotebook.Tab", background=BG_CARD, foreground=FG_GRAY, padding=[12, 6], font=("Segoe UI", 10, "bold"))
        style.map("TNotebook.Tab", background=[("selected", BG_DARK)], foreground=[("selected", FG_TEXT)])

    def build_ui(self):
        header_frame = tk.Frame(self.root, bg=BG_CARD, height=60)
        header_frame.pack(fill=tk.X, side=tk.TOP)
        header_frame.pack_propagate(False)

        tk.Label(header_frame, text="⚡ AZUKI E-LEARNING ADMIN", fg=FG_TEXT, bg=BG_CARD, font=("Segoe UI", 14, "bold")).pack(side=tk.LEFT, padx=20, pady=15)
        self.lbl_status = tk.Label(header_frame, text="🔴 Chưa kết nối", fg=BTN_DANGER, bg=BG_CARD, font=("Segoe UI", 10, "bold"))
        self.lbl_status.pack(side=tk.RIGHT, padx=20, pady=15)

        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.tab_conn = ttk.Frame(self.notebook)
        self.tab_lib = ttk.Frame(self.notebook)
        self.tab_clip = ttk.Frame(self.notebook)
        self.tab_bulk = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_conn, text="🔌 Cài Đặt")
        self.notebook.add(self.tab_lib, text="🗂️ Thư Viện Đề Thi")
        self.notebook.add(self.tab_clip, text="📷 Clipboard AI")
        self.notebook.add(self.tab_bulk, text="📂 Bulk Import")

        self.build_conn_tab()
        self.build_lib_tab()
        self.build_clip_tab()
        self.build_bulk_tab()

    def build_conn_tab(self):
        container = tk.Frame(self.tab_conn, bg=BG_DARK)
        container.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        card = tk.Frame(container, bg=BG_CARD, padx=30, pady=30, highlightbackground=BORDER_COLOR, highlightthickness=1)
        card.pack()

        tk.Label(card, text="CẤU HÌNH SERVER & AI", fg=FG_TEXT, bg=BG_CARD, font=("Segoe UI", 12, "bold")).grid(row=0, columnspan=2, pady=(0, 20))
        tk.Label(card, text="Server URL:", fg=FG_GRAY, bg=BG_CARD).grid(row=1, column=0, sticky=tk.W, pady=5)
        self.ent_url = tk.Entry(card, width=40, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        self.ent_url.insert(0, self.server_url)
        self.ent_url.grid(row=1, column=1, pady=5, padx=10)

        tk.Label(card, text="API Token:", fg=FG_GRAY, bg=BG_CARD).grid(row=2, column=0, sticky=tk.W, pady=5)
        self.ent_token = tk.Entry(card, width=40, show="*", bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        self.ent_token.insert(0, self.api_token)
        self.ent_token.grid(row=2, column=1, pady=5, padx=10)

        tk.Label(card, text="AI Endpoint:", fg=FG_GRAY, bg=BG_CARD).grid(row=3, column=0, sticky=tk.W, pady=5)
        self.ent_ai_endpoint = tk.Entry(card, width=40, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        self.ent_ai_endpoint.insert(0, self.ai_endpoint)
        self.ent_ai_endpoint.grid(row=3, column=1, pady=5, padx=10)

        tk.Label(card, text="AI Key:", fg=FG_GRAY, bg=BG_CARD).grid(row=4, column=0, sticky=tk.W, pady=5)
        self.ent_ai_key = tk.Entry(card, width=40, show="*", bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        self.ent_ai_key.insert(0, self.ai_key)
        self.ent_ai_key.grid(row=4, column=1, pady=5, padx=10)

        tk.Label(card, text="Model AI:", fg=FG_GRAY, bg=BG_CARD).grid(row=5, column=0, sticky=tk.W, pady=5)
        self.cb_models = ttk.Combobox(card, values=[self.model_name], width=37)
        self.cb_models.set(self.model_name)
        self.cb_models.grid(row=5, column=1, pady=5, padx=10)

        btn_frame = tk.Frame(card, bg=BG_CARD)
        btn_frame.grid(row=6, columnspan=2, pady=(20, 0))
        tk.Button(btn_frame, text="Quét Model", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), padx=10, command=self.scan_models).pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="Kết Nối", bg=BTN_PRIMARY, fg=FG_WHITE, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), padx=15, command=self.connect_server).pack(side=tk.LEFT, padx=5)

    def build_lib_tab(self):
        paned = tk.PanedWindow(self.tab_lib, orient=tk.HORIZONTAL, bg=BORDER_COLOR, bd=0)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Subjects
        f_sub = tk.Frame(paned, bg=BG_DARK, width=280)
        tk.Label(f_sub, text="📖 Danh Sách Môn Học", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        self.tree_sub = ttk.Treeview(f_sub, columns=("code", "name"), show="headings")
        self.tree_sub.heading("code", text="Mã"); self.tree_sub.column("code", width=80, anchor=tk.CENTER)
        self.tree_sub.heading("name", text="Tên Môn"); self.tree_sub.column("name", width=180)
        self.tree_sub.pack(fill=tk.BOTH, expand=True)
        self.tree_sub.bind("<<TreeviewSelect>>", self.on_subject_select)

        btns_sub = tk.Frame(f_sub, bg=BG_DARK, pady=5)
        btns_sub.pack(fill=tk.X)
        tk.Button(btns_sub, text="Thêm", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=self.add_subject_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_sub, text="Sửa", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, command=self.edit_subject_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_sub, text="Xóa", bg=BTN_DANGER, fg=FG_WHITE, relief=tk.FLAT, command=self.delete_subject).pack(side=tk.LEFT, padx=2)

        # Quizzes
        f_quiz = tk.Frame(paned, bg=BG_DARK, width=280)
        tk.Label(f_quiz, text="📝 Bộ Đề", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        self.tree_quiz = ttk.Treeview(f_quiz, columns=("name",), show="headings")
        self.tree_quiz.heading("name", text="Tên Bộ Đề"); self.tree_quiz.column("name", width=250)
        self.tree_quiz.pack(fill=tk.BOTH, expand=True)
        self.tree_quiz.bind("<<TreeviewSelect>>", self.on_quiz_select)

        btns_quiz = tk.Frame(f_quiz, bg=BG_DARK, pady=5)
        btns_quiz.pack(fill=tk.X)
        tk.Button(btns_quiz, text="Thêm", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=self.add_quiz_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_quiz, text="Sửa", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, command=self.edit_quiz_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_quiz, text="Xóa", bg=BTN_DANGER, fg=FG_WHITE, relief=tk.FLAT, command=self.delete_quiz).pack(side=tk.LEFT, padx=2)

        # Questions
        f_q = tk.Frame(paned, bg=BG_DARK, width=540)
        tk.Label(f_q, text="❓ Danh Sách Câu Hỏi", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        
        # ĐÃ FIX: Khôi phục thanh Tìm Kiếm
        search_f = tk.Frame(f_q, bg=BG_DARK)
        search_f.pack(fill=tk.X, pady=(0, 5))
        tk.Label(search_f, text="🔍 Lọc:", bg=BG_DARK, fg=FG_GRAY).pack(side=tk.LEFT)
        self.ent_search_q = tk.Entry(search_f, bg=BG_INPUT, fg=FG_TEXT, relief=tk.SOLID, borderwidth=1)
        self.ent_search_q.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 0), ipady=4)
        self.ent_search_q.bind("<KeyRelease>", self.filter_questions)

        self.tree_q = ttk.Treeview(f_q, columns=("content",), show="headings")
        self.tree_q.heading("content", text="Nội Dung Câu Hỏi")
        self.tree_q.column("content", width=500)
        self.tree_q.pack(fill=tk.BOTH, expand=True)

        btns_q = tk.Frame(f_q, bg=BG_DARK, pady=5)
        btns_q.pack(fill=tk.X)
        tk.Button(btns_q, text="Thêm", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=self.add_question_dialog, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_q, text="Sửa", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, command=self.edit_question_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_q, text="Xóa", bg=BTN_DANGER, fg=FG_WHITE, relief=tk.FLAT, command=self.delete_question).pack(side=tk.LEFT, padx=2)
        
        tk.Button(btns_q, text="✨ Giải Hàng Loạt", bg=HIGHLIGHT_COLOR, fg=BTN_PRIMARY, relief=tk.FLAT, command=self.bulk_ai_solve_dialog, font=("Segoe UI", 9, "bold")).pack(side=tk.RIGHT, padx=5)
        tk.Button(btns_q, text="📥 Import JSON", bg="#8B5CF6", fg=FG_WHITE, relief=tk.FLAT, command=self.import_json_dialog).pack(side=tk.RIGHT, padx=5)

        paned.add(f_sub)
        paned.add(f_quiz)
        paned.add(f_q)

    def build_clip_tab(self):
        paned = tk.PanedWindow(self.tab_clip, orient=tk.HORIZONTAL, bg=BORDER_COLOR, bd=0)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        left_f = tk.Frame(paned, bg=BG_DARK, width=380, padx=10)
        tk.Label(left_f, text="CLIPBOARD AI", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)

        self.lbl_clip_target = tk.Label(left_f, text="⚠️ Chưa chọn Bộ đề", bg=BG_DARK, fg=BTN_DANGER, font=("Segoe UI", 10, "bold"))
        self.lbl_clip_target.pack(anchor=tk.W, pady=5)

        self.btn_toggle_clip = tk.Button(left_f, text="BẬT THEO DÕI", bg=BTN_PRIMARY, fg=FG_WHITE, font=("Segoe UI", 10, "bold"), relief=tk.FLAT, height=2, command=self.toggle_clipboard_monitor)
        self.btn_toggle_clip.pack(fill=tk.X, pady=10)

        self.val_auto_save = tk.BooleanVar(value=False)
        tk.Checkbutton(left_f, text="Tự động lưu không cần xác nhận", variable=self.val_auto_save, bg=BG_DARK, fg=FG_TEXT, selectcolor=BG_INPUT).pack(anchor=tk.W, pady=5)

        # =========================================================
        # CHÈN THÊM KHU VỰC 🤖 AUTO-BOT CÀO DATA VÀO ĐÂY
        # =========================================================
        bot_f = tk.Frame(left_f, bg=BG_CARD, highlightthickness=1, highlightbackground=BORDER_COLOR, padx=10, pady=10)
        bot_f.pack(fill=tk.X, pady=(10, 0))
        
        tk.Label(bot_f, text="🤖 AUTO-BOT CHUYỂN TRANG", bg=BG_CARD, fg=BTN_PRIMARY, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=(0, 5))
        
        row1 = tk.Frame(bot_f, bg=BG_CARD)
        row1.pack(fill=tk.X, pady=2)
        tk.Label(row1, text="Số câu cào:", bg=BG_CARD, fg=FG_TEXT).pack(side=tk.LEFT)
        self.ent_bot_count = tk.Entry(row1, width=8, bg=BG_INPUT, relief=tk.FLAT)
        self.ent_bot_count.insert(0, "10")
        self.ent_bot_count.pack(side=tk.LEFT, padx=5)
        
        tk.Label(row1, text="Delay (s):", bg=BG_CARD, fg=FG_TEXT).pack(side=tk.LEFT, padx=(10, 0))
        self.ent_bot_delay = tk.Entry(row1, width=5, bg=BG_INPUT, relief=tk.FLAT)
        self.ent_bot_delay.insert(0, "2.0")
        self.ent_bot_delay.pack(side=tk.LEFT, padx=5)
        
        self.bot_crop_box = None
        row2 = tk.Frame(bot_f, bg=BG_CARD)
        row2.pack(fill=tk.X, pady=(5, 5))
        
        tk.Label(row2, text="Vùng:", bg=BG_CARD, fg=FG_TEXT).pack(side=tk.LEFT)
        self.lbl_bot_region = tk.Label(row2, text="Toàn màn hình", bg=BG_CARD, fg=BTN_PRIMARY, font=("Segoe UI", 9, "bold"))
        self.lbl_bot_region.pack(side=tk.LEFT, padx=5)
        
        tk.Button(row2, text="🎯 Chọn Vùng", bg=BG_INPUT, fg=FG_TEXT, relief=tk.SOLID, borderwidth=1, cursor="hand2", command=self.select_bot_region).pack(side=tk.RIGHT)
        tk.Button(row2, text="✖ Reset", bg=BG_INPUT, fg=FG_TEXT, relief=tk.SOLID, borderwidth=1, cursor="hand2", command=self.reset_bot_region).pack(side=tk.RIGHT, padx=5)

        self.btn_start_bot = tk.Button(bot_f, text="▶ BẮT ĐẦU AUTO (Đếm ngược 3s)", bg="#8B5CF6", fg=FG_WHITE, font=("Segoe UI", 9, "bold"), relief=tk.FLAT, command=self.toggle_auto_bot)
        self.btn_start_bot.pack(fill=tk.X, pady=(10, 0))
        # =========================================================

        tk.Label(left_f, text="Nhật ký:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=(15, 2))
        self.txt_clip_logs = tk.Text(left_f, height=18, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT, font=("Consolas", 9))
        self.txt_clip_logs.pack(fill=tk.BOTH, expand=True, pady=5)

        right_f = tk.Frame(paned, bg=BG_DARK, padx=10)
        tk.Label(right_f, text="Xem Trước", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)

        scroll_c = tk.Canvas(right_f, bg=BG_DARK, bd=0, highlightthickness=0)
        scroll_c.pack(fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(right_f, orient="vertical", command=scroll_c.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        scroll_c.configure(yscrollcommand=scrollbar.set)
        
        self.inner_review_f = tk.Frame(scroll_c, bg=BG_DARK)
        scroll_c.create_window((0, 0), window=self.inner_review_f, anchor=tk.NW)
        self.inner_review_f.bind("<Configure>", lambda e: scroll_c.configure(scrollregion=scroll_c.bbox("all")))

        tk.Label(self.inner_review_f, text="Câu hỏi:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=2)
        self.txt_clip_q = tk.Text(self.inner_review_f, height=4, width=80, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        self.txt_clip_q.pack(fill=tk.X, pady=2)

        tk.Label(self.inner_review_f, text="Danh sách đáp án:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=10)
        
        # --- KHU VỰC ĐÁP ÁN ĐỘNG CHO CLIPBOARD ---
        self.clip_ans_container = tk.Frame(self.inner_review_f, bg=BG_DARK)
        self.clip_ans_container.pack(fill=tk.X)
        self.clip_answers = []
        self.render_clip_answers([]) # Render mặc định 4 ô trống

        tk.Label(self.inner_review_f, text="Giải thích:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=(10, 2))
        self.txt_clip_expl = tk.Text(self.inner_review_f, height=6, width=80, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        self.txt_clip_expl.pack(fill=tk.X, pady=2)

        self.btn_save_clip_preview = tk.Button(self.inner_review_f, text="Lưu Câu Hỏi", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), pady=6, command=self.save_clip_preview, state=tk.DISABLED)
        self.btn_save_clip_preview.pack(fill=tk.X, pady=15)

        paned.add(left_f)
        paned.add(right_f)

    def render_clip_answers(self, answers_data=None):
        """Hàm tự động vẽ lại số lượng ô đáp án dựa trên dữ liệu AI trả về"""
        if answers_data is None: answers_data = []
        
        # Xóa sạch các ô cũ
        for widget in self.clip_ans_container.winfo_children():
            widget.destroy()
        self.clip_answers.clear()

        # Số lượng tạo ra = Số đáp án AI bóc được (Tối thiểu 4 ô nếu đang rỗng)
        count = len(answers_data) if answers_data else 4
        
        for i in range(count):
            f_ans = tk.Frame(self.clip_ans_container, bg=BG_DARK)
            f_ans.pack(fill=tk.X, pady=2)
            
            tk.Label(f_ans, text=f"{chr(65+i)}.", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(side=tk.LEFT, padx=5)
            c_val = tk.BooleanVar(value=False)
            tk.Checkbutton(f_ans, variable=c_val, bg=BG_DARK, selectcolor=BG_INPUT).pack(side=tk.LEFT)
            ent = tk.Entry(f_ans, width=65, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
            ent.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
            
            # Đổ data nếu có
            if answers_data and i < len(answers_data):
                ent.insert(0, answers_data[i].get('content', ''))
                c_val.set(answers_data[i].get('isCorrect', False))
                
            self.clip_answers.append((c_val, ent))

    def build_bulk_tab(self):
        paned = tk.PanedWindow(self.tab_bulk, orient=tk.HORIZONTAL, bg=BORDER_COLOR, bd=0)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        left_f = tk.Frame(paned, bg=BG_DARK, width=380, padx=10)
        tk.Label(left_f, text="BULK IMPORT", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)

        self.lbl_bulk_target = tk.Label(left_f, text="⚠️ Chưa chọn Bộ đề", bg=BG_DARK, fg=BTN_DANGER, font=("Segoe UI", 10, "bold"))
        self.lbl_bulk_target.pack(anchor=tk.W, pady=5)

        tk.Button(left_f, text="Chọn Thư Mục Ảnh", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), command=self.select_bulk_folder).pack(fill=tk.X, pady=10)
        self.btn_start_bulk = tk.Button(left_f, text="BẮT ĐẦU IMPORT", bg=BTN_SUCCESS, fg=FG_WHITE, font=("Segoe UI", 10, "bold"), relief=tk.FLAT, height=2, state=tk.DISABLED, command=self.start_bulk_import)
        self.btn_start_bulk.pack(fill=tk.X, pady=10)

        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(left_f, variable=self.progress_var, maximum=100)
        self.progress_bar.pack(fill=tk.X, pady=10)
        self.lbl_bulk_status = tk.Label(left_f, text="Số lượng ảnh: 0/0", bg=BG_DARK, fg=FG_GRAY)
        self.lbl_bulk_status.pack(anchor=tk.W)

        tk.Label(left_f, text="Nhật ký:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=(15, 2))
        self.txt_bulk_logs = tk.Text(left_f, height=18, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT, font=("Consolas", 9))
        self.txt_bulk_logs.pack(fill=tk.BOTH, expand=True, pady=5)

        right_f = tk.Frame(paned, bg=BG_DARK, padx=10)
        tk.Label(right_f, text="Danh Sách", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)
        self.tree_bulk_files = ttk.Treeview(right_f, columns=("name", "status"), show="headings")
        self.tree_bulk_files.heading("name", text="Tên File"); self.tree_bulk_files.column("name", width=400)
        self.tree_bulk_files.heading("status", text="Trạng Thái"); self.tree_bulk_files.column("status", width=150, anchor=tk.CENTER)
        self.tree_bulk_files.pack(fill=tk.BOTH, expand=True)

        paned.add(left_f)
        paned.add(right_f)

    # --- ACTIONS & LOGIC ---

    def log_clip(self, msg):
        self.txt_clip_logs.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {msg}\n")
        self.txt_clip_logs.see(tk.END)

    def log_bulk(self, msg):
        self.txt_bulk_logs.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {msg}\n")
        self.txt_bulk_logs.see(tk.END)

    def connect_server(self, silent=False):
        url = self.ent_url.get().strip()
        token = self.ent_token.get().strip()
        if not url or not token:
            if not silent: messagebox.showerror("Lỗi", "Vui lòng nhập Server URL và API Token!")
            return

        self.client = APIClient(url, token)
        def check():
            user = self.client.test_connection()
            if user:
                self.server_url = url
                self.api_token = token
                self.ai_endpoint = self.ent_ai_endpoint.get().strip()
                self.ai_key = self.ent_ai_key.get().strip()
                self.save_local_config()
                
                models = self.client.get_models(self.ai_endpoint, self.ai_key)
                self.root.after(0, lambda: self.on_connection_success(user, models, silent))
            else:
                self.root.after(0, lambda: self.on_connection_failure(silent))

        threading.Thread(target=check, daemon=True).start()

    def on_connection_success(self, user, models, silent):
        self.lbl_status.config(text=f"🟢 Đã đăng nhập: {user.get('name', 'Admin')}", fg=BTN_SUCCESS)
        self.cb_models.config(values=models)
        if models: self.cb_models.set(models[0]); self.model_name = models[0]
        if not silent: messagebox.showinfo("Thành Công", f"Đã kết nối thành công!\nChào mừng {user.get('name')}!")
        self.load_subjects()

    def on_connection_failure(self, silent):
        self.lbl_status.config(text="🔴 Kết nối thất bại", fg=BTN_DANGER)
        self.client = None
        if not silent: messagebox.showerror("Lỗi", "Kết nối thất bại. Kiểm tra URL/Token!")

    def scan_models(self):
        endpoint = self.ent_ai_endpoint.get().strip()
        key = self.ent_ai_key.get().strip()
        if not endpoint:
            messagebox.showerror("Lỗi", "Vui lòng điền AI Endpoint!")
            return
            
        self.ai_endpoint = endpoint
        self.ai_key = key
        self.save_local_config()
        
        def scan():
            client = self.client or APIClient(self.ent_url.get().strip(), self.ent_token.get().strip())
            models = client.get_models(self.ai_endpoint, self.ai_key)
            if models: self.root.after(0, lambda: self.on_models_scanned(models))
            else: self.root.after(0, lambda: messagebox.showerror("Lỗi", "Không thể lấy danh sách model!"))
        threading.Thread(target=scan, daemon=True).start()
        
    def on_models_scanned(self, models):
        self.cb_models.config(values=models)
        if models: self.cb_models.set(models[0]); self.model_name = models[0]
        self.save_local_config()
        messagebox.showinfo("Thành Công", f"Tìm thấy {len(models)} model.")

    def load_subjects(self):
        if not self.client: return
        for item in self.tree_sub.get_children(): self.tree_sub.delete(item)
        for item in self.tree_quiz.get_children(): self.tree_quiz.delete(item)
        for item in self.tree_q.get_children(): self.tree_q.delete(item)
            
        self.selected_subject_id = None
        self.selected_quiz_id = None
        self.update_target_labels()

        def load():
            try:
                self.subjects = self.client.get_subjects()
                self.root.after(0, self.display_subjects)
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Lỗi", f"Không thể tải môn: {e}"))
        threading.Thread(target=load, daemon=True).start()

    def display_subjects(self):
        for s in self.subjects: self.tree_sub.insert("", tk.END, iid=s['id'], values=(s['code'], s['name']))

    def on_subject_select(self, event):
        sel = self.tree_sub.selection()
        if not sel: return
        self.selected_subject_id = int(sel[0])
        self.selected_quiz_id = None
        self.update_target_labels()
        self.load_quizzes()

    def load_quizzes(self):
        for item in self.tree_quiz.get_children(): self.tree_quiz.delete(item)
        for item in self.tree_q.get_children(): self.tree_q.delete(item)
        if not self.selected_subject_id: return

        def load():
            try:
                self.quizzes = self.client.get_quizzes(self.selected_subject_id)
                self.root.after(0, self.display_quizzes)
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Lỗi", f"Lỗi: {e}"))
        threading.Thread(target=load, daemon=True).start()

    def display_quizzes(self):
        for q in self.quizzes: self.tree_quiz.insert("", tk.END, iid=q['id'], values=(q['name'],))

    def on_quiz_select(self, event):
        sel = self.tree_quiz.selection()
        if not sel: return
        self.selected_quiz_id = int(sel[0])
        self.update_target_labels()
        self.load_questions()

    def update_target_labels(self):
        sub_name = ""
        quiz_name = ""
        if self.selected_subject_id:
            s_obj = next((s for s in self.subjects if s['id'] == self.selected_subject_id), None)
            if s_obj: sub_name = s_obj['code']
        if self.selected_quiz_id:
            q_obj = next((q for q in self.quizzes if q['id'] == self.selected_quiz_id), None)
            if q_obj: quiz_name = q_obj['name']

        if self.selected_quiz_id:
            target_str = f"🎯 Nạp vào: {sub_name} → {quiz_name}"
            self.lbl_clip_target.config(text=target_str, fg=BTN_SUCCESS)
            self.lbl_bulk_target.config(text=target_str, fg=BTN_SUCCESS)
            self.btn_start_bulk.config(state=tk.NORMAL)
        else:
            self.lbl_clip_target.config(text="⚠️ Chưa chọn Bộ đề", fg=BTN_DANGER)
            self.lbl_bulk_target.config(text="⚠️ Chưa chọn Bộ đề", fg=BTN_DANGER)
            self.btn_start_bulk.config(state=tk.DISABLED)

    # ĐÃ FIX LỖI GỌI HÀM load_questions
    def load_questions(self):
        if not self.selected_quiz_id: return
        try:
            self.questions = self.client.get_questions(self.selected_quiz_id)
            self.display_questions()
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể tải câu hỏi:\n{e}")

    def filter_questions(self, event=None):
        keyword = self.ent_search_q.get().strip().lower()
        for item in self.tree_q.get_children(): self.tree_q.delete(item)
            
        for idx, q in enumerate(self.questions, start=1):
            raw_content = q.get('content', '')
            clean_preview = " ".join(raw_content.splitlines())
            if keyword in clean_preview.lower():
                display_text = f"Câu {idx}: {clean_preview}"
                self.tree_q.insert("", tk.END, iid=q['id'], values=(display_text,))
                
    def display_questions(self):
        if hasattr(self, 'ent_search_q'): self.ent_search_q.delete(0, tk.END)
        for item in self.tree_q.get_children(): self.tree_q.delete(item)
        for idx, q in enumerate(self.questions, start=1):
            raw_content = q.get('content', '')
            clean_preview = " ".join(raw_content.splitlines())
            display_text = f"Câu {idx}: {clean_preview}"
            self.tree_q.insert("", tk.END, iid=q['id'], values=(display_text,))

    # --- CRUD DIALOGS ---

    def add_subject_dialog(self):
        if not self.client: return
        d = tk.Toplevel(self.root)
        d.title("Thêm Môn Học")
        d.geometry("380x220")
        d.configure(bg=BG_DARK); d.transient(self.root); d.grab_set()

        tk.Label(d, text="Mã môn:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=2)
        ent_code = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        ent_code.pack(fill=tk.X, padx=15, pady=2)

        tk.Label(d, text="Tên môn:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=2)
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            c, n = ent_code.get().strip(), ent_name.get().strip()
            if not c or not n: return
            try:
                self.client.save_subject(c, n)
                d.destroy(); self.load_subjects()
            except Exception as e: messagebox.showerror("Lỗi", f"Lỗi: {e}")
        tk.Button(d, text="Lưu", bg=BTN_SUCCESS, fg=FG_WHITE, command=save).pack(fill=tk.X, padx=15, pady=20)

    def edit_subject_dialog(self):
        if not self.selected_subject_id: return
        s_obj = next((s for s in self.subjects if s['id'] == self.selected_subject_id), None)
        if not s_obj: return

        d = tk.Toplevel(self.root)
        d.title("Sửa Môn")
        d.geometry("380x220"); d.configure(bg=BG_DARK); d.transient(self.root); d.grab_set()

        tk.Label(d, text="Mã môn:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=2)
        ent_code = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        ent_code.insert(0, s_obj['code']); ent_code.pack(fill=tk.X, padx=15, pady=2)

        tk.Label(d, text="Tên môn:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=2)
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        ent_name.insert(0, s_obj['name']); ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            c, n = ent_code.get().strip(), ent_name.get().strip()
            if not c or not n: return
            try:
                self.client.save_subject(c, n, self.selected_subject_id)
                d.destroy(); self.load_subjects()
            except Exception as e: messagebox.showerror("Lỗi", f"Lỗi: {e}")
        tk.Button(d, text="Lưu", bg=BTN_PRIMARY, fg=FG_WHITE, command=save).pack(fill=tk.X, padx=15, pady=20)

    def delete_subject(self):
        if not self.selected_subject_id: return
        if not messagebox.askyesno("Xác nhận", "Xóa môn học này?"): return
        try:
            self.client.delete_subject(self.selected_subject_id)
            self.load_subjects()
        except Exception as e: messagebox.showerror("Lỗi", f"Lỗi: {e}")

    def add_quiz_dialog(self):
        if not self.selected_subject_id: return
        d = tk.Toplevel(self.root); d.title("Thêm Bộ Đề"); d.geometry("380x150")
        d.configure(bg=BG_DARK); d.transient(self.root); d.grab_set()

        tk.Label(d, text="Tên bộ đề:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=2)
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            if not ent_name.get().strip(): return
            try:
                self.client.save_quiz(ent_name.get().strip(), self.selected_subject_id)
                d.destroy(); self.load_quizzes()
            except Exception as e: messagebox.showerror("Lỗi", f"Lỗi: {e}")
        tk.Button(d, text="Lưu", bg=BTN_SUCCESS, fg=FG_WHITE, command=save).pack(fill=tk.X, padx=15, pady=15)

    def edit_quiz_dialog(self):
        if not self.selected_quiz_id: return
        q_obj = next((q for q in self.quizzes if q['id'] == self.selected_quiz_id), None)
        if not q_obj: return

        d = tk.Toplevel(self.root); d.title("Sửa Bộ Đề"); d.geometry("380x150")
        d.configure(bg=BG_DARK); d.transient(self.root); d.grab_set()

        tk.Label(d, text="Tên bộ đề:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=2)
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT)
        ent_name.insert(0, q_obj['name']); ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            if not ent_name.get().strip(): return
            try:
                self.client.save_quiz(ent_name.get().strip(), self.selected_subject_id, self.selected_quiz_id)
                d.destroy(); self.load_quizzes()
            except Exception as e: messagebox.showerror("Lỗi", f"Lỗi: {e}")
        tk.Button(d, text="Lưu", bg=BTN_PRIMARY, fg=FG_WHITE, command=save).pack(fill=tk.X, padx=15, pady=15)

    def delete_quiz(self):
        if not self.selected_quiz_id: return
        if not messagebox.askyesno("Xác nhận", "Xóa bộ đề này?"): return
        try:
            self.client.delete_quiz(self.selected_quiz_id)
            self.load_quizzes()
        except Exception as e: messagebox.showerror("Lỗi", f"Lỗi: {e}")

    def add_question_dialog(self):
        if not self.selected_quiz_id:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn bộ đề!")
            return
        self.question_editor_window(question=None, q_index=len(self.tree_q.get_children()) + 1)

    def edit_question_dialog(self):
        sel = self.tree_q.selection()
        if not sel: return
        q_obj = next((q for q in self.questions if q['id'] == int(sel[0])), None)
        if not q_obj: return
        self.question_editor_window(question=q_obj, q_index=self.tree_q.index(sel[0]) + 1)

    def delete_question(self):
        sel = self.tree_q.selection()
        if not sel: return
        if not messagebox.askyesno("Xác nhận", "Xóa câu hỏi này?"): return
        try:
            self.client.delete_question(int(sel[0]))
            self.load_questions()
        except Exception as e: messagebox.showerror("Lỗi", f"Lỗi: {e}")

    def import_json_dialog(self):
        if not self.selected_quiz_id: return
        filepath = filedialog.askopenfilename(title="Chọn JSON", filetypes=[("JSON files", "*.json")])
        if not filepath: return

        try:
            with open(filepath, 'r', encoding='utf-8') as f: data = json.load(f)
        except Exception as e:
            messagebox.showerror("Lỗi", f"Lỗi đọc file: {e}")
            return

        if isinstance(data, dict):
            if 'questionsList' in data and isinstance(data['questionsList'], list): data = data['questionsList']
            elif 'questions' in data and isinstance(data['questions'], list): data = data['questions']
            else: data = [data]
        elif not isinstance(data, list): return
        
        if not data: return
        if not messagebox.askyesno("Xác nhận", f"Tìm thấy {len(data)} câu. Import?"): return

        def do_import():
            success_count = 0
            for q_data in data:
                try:
                    content = q_data.get('content', '')
                    if not content: continue
                    answers_list = []
                    raw_answers = q_data.get('answersList') or q_data.get('answers') or []
                    for idx, ans in enumerate(raw_answers):
                        answers_list.append({
                            "id": 0, "content": ans.get('content', ''), 
                            "isCorrect": ans.get('isCorrect', ans.get('is_correct', False)),
                            "indexOrder": idx, "questionTargetId": 0
                        })
                    while len(answers_list) < 4:
                        answers_list.append({
                            "id": 0, "content": "", "isCorrect": False,
                            "indexOrder": len(answers_list), "questionTargetId": 0
                        })
                        
                    payload = {
                        "content": clean_html_explanation(q_data['question']),
                        "explanation": q_data['explanation'], # BỎ clean_html_explanation ĐỂ GIỮ NGUYÊN HTML
                        "imageUrl": None,
                        "explanationImage": None,
                        "quizTargetId": self.selected_quiz_id,
                        "answersList": answers_list
                    }
                    self.client.save_question(payload)
                    success_count += 1
                except Exception as e: print(f"Lỗi import câu hỏi: {e}")
            self.root.after(0, self.load_questions)
            self.root.after(0, lambda: messagebox.showinfo("Hoàn tất", f"Import {success_count}/{len(data)} câu."))
        threading.Thread(target=do_import, daemon=True).start()

    def bulk_ai_solve_dialog(self):
        selected_items = self.tree_q.selection()
        if not selected_items: return

        log_win = tk.Toplevel(self.root)
        log_win.title(f"Giải AI ({len(selected_items)} câu)")
        log_win.geometry("650x450")
        log_win.configure(bg=BG_DARK); log_win.transient(self.root); log_win.grab_set()

        txt_log = tk.Text(log_win, bg="#0F172A", fg="#CBD5E1", font=("Consolas", 10))
        txt_log.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        txt_log.tag_config("success", foreground="#22C55E"); txt_log.tag_config("error", foreground="#EF4444")
        txt_log.tag_config("info", foreground="#3B82F6")
        
        btn_close = tk.Button(log_win, text="Đóng", command=log_win.destroy, state=tk.DISABLED, bg=BG_CARD)
        btn_close.pack(pady=5)

        def log(msg, tag=None):
            self.root.after(0, lambda: txt_log.insert(tk.END, msg + "\n", tag))
            self.root.after(0, lambda: txt_log.see(tk.END))

        def process_thread():
            model = self.cb_models.get().strip()
            endpoint, key = self.get_active_ai_config()
            success_count, error_count = 0, 0

            for idx, item_id in enumerate(selected_items, start=1):
                q = next((q for q in self.questions if str(q['id']) == str(item_id)), None)
                if not q: continue

                q_id, q_content, answers_list = q.get('id'), q.get('content', ''), q.get('answersList', [])
                log(f"[{idx}/{len(selected_items)}] Giải Câu {q_id}...", "info")
                if not q_content or not answers_list: error_count += 1; continue

                try:
                    full_q_text = q_content + "\n\nCác đáp án:\n"
                    for i, a in enumerate(answers_list): full_q_text += f"{chr(65+i)}. {a.get('content', '')}\n"

                    data = self.client.solve_text(full_q_text, model, custom_url=endpoint, custom_key=key)

                    ai_answers = data.get('answers', [])
                    updated_answers = []
                    for i, ext_ans in enumerate(answers_list):
                        ans_dict = ext_ans.copy()
                        if i < len(ai_answers): ans_dict['isCorrect'] = ai_answers[i].get('isCorrect', False)
                        updated_answers.append(ans_dict)

                    payload = {
                        "id": q_id, "content": q_content, "explanation": data.get('explanation', ''),
                        "imageUrl": q.get('imageUrl'), "explanationImage": q.get('explanationImage'),
                        "quizTargetId": q.get('quizTargetId', self.selected_quiz_id), "answersList": updated_answers
                    }
                    self.client.save_question(payload)
                    success_count += 1
                    log(f"   ✅ Cập nhật thành công.", "success")
                except Exception as e:
                    error_count += 1
                    log(f"   ❌ Lỗi: {e}", "error")
                time.sleep(0.5)

            log(f"\n🏁 Xong! Thành công: {success_count}, Thất bại: {error_count}", "info")
            self.root.after(0, lambda: btn_close.config(state=tk.NORMAL, bg=BTN_DANGER, fg=FG_WHITE))
            self.root.after(0, self.load_questions)

        threading.Thread(target=process_thread, daemon=True).start()

    def question_editor_window(self, question=None, q_index=None):
        d = tk.Toplevel(self.root)
        d.title(f"Chỉnh Sửa Câu {q_index}" if question else f"Thêm Câu {q_index}")
        d.geometry("700x750")
        d.configure(bg=BG_CARD); d.transient(self.root); d.grab_set()

        scroll_c = tk.Canvas(d, bg=BG_CARD, bd=0, highlightthickness=0)
        scroll_c.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(d, orient="vertical", command=scroll_c.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        scroll_c.configure(yscrollcommand=scrollbar.set)

        form = tk.Frame(scroll_c, bg=BG_CARD, padx=20, pady=10)
        scroll_c.create_window((0, 0), window=form, anchor=tk.NW, width=660)
        form.bind("<Configure>", lambda e: scroll_c.configure(scrollregion=scroll_c.bbox("all")))

        def _on_mousewheel(event): scroll_c.yview_scroll(int(-1*(event.delta/120)), "units")
        d.bind("<Enter>", lambda e: d.bind_all("<MouseWheel>", _on_mousewheel))
        d.bind("<Leave>", lambda e: d.unbind_all("<MouseWheel>"))
        def on_closing(): d.unbind_all("<MouseWheel>"); d.destroy()
        d.protocol("WM_DELETE_WINDOW", on_closing)

        self.current_img_state = {
            "question": question.get('imageUrl') if question else None,
            "explanation": question.get('explanationImage') if question else None
        }

        def create_img_up(parent, label_text, target_key):
            frame = tk.Frame(parent, bg=BG_CARD); frame.pack(fill=tk.X, pady=5)
            tk.Label(frame, text=label_text, bg=BG_CARD, fg=FG_GRAY).pack(anchor=tk.W)
            c = tk.Canvas(frame, width=380, height=160, bg=BG_CARD, highlightthickness=0); c.pack(anchor=tk.W)
            
            def draw_empty():
                c.delete("all"); c.config(cursor="hand2")
                c.create_rectangle(2, 2, 378, 158, dash=(5, 5), outline=BORDER_COLOR)
                c.create_text(190, 80, text="Nhấp chọn ảnh", fill=FG_GRAY)
                c.bind("<Button-1>", lambda e: choose())
            
            def draw_img(img):
                c.delete("all"); c.unbind("<Button-1>"); c.config(cursor="arrow")
                img.thumbnail((370, 150))
                c.photo = ImageTk.PhotoImage(img)
                c.create_image(190, 80, image=c.photo, anchor=tk.CENTER)
                btn = tk.Button(c, text="✕", bg="#666", fg="white", command=remove, cursor="hand2")
                c.create_window(360, 15, window=btn)

            def choose():
                filepath = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
                if not filepath: return
                img = Image.open(filepath)
                draw_img(img.copy())
                buf = io.BytesIO()
                img.thumbnail((1024, 1024))
                img.save(buf, format="PNG")
                self.current_img_state[target_key] = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"

            def remove(): self.current_img_state[target_key] = None; draw_empty()

            if self.current_img_state[target_key] and self.current_img_state[target_key].startswith("data:image"):
                b64 = self.current_img_state[target_key].split(",")[1]
                draw_img(Image.open(io.BytesIO(base64.b64decode(b64))))
            elif self.current_img_state[target_key]:
                draw_empty(); c.create_text(190, 80, text="[Ảnh trên Server]", fill=FG_GRAY)
            else: draw_empty()

        tk.Label(form, text=f"Câu {q_index}: Nội dung", bg=BG_CARD, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W)
        txt_content = tk.Text(form, height=3, bg=BG_DARK, fg=FG_TEXT, relief=tk.SOLID, borderwidth=1)
        if question: txt_content.insert("1.0", clean_html_explanation(question.get('content', '')))
        txt_content.pack(fill=tk.X, pady=2)
        create_img_up(form, "Hình câu hỏi", "question")

        tk.Label(form, text="Đáp án", bg=BG_CARD, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        rows_f = tk.Frame(form, bg=BG_CARD); rows_f.pack(fill=tk.X)
        ans_widgets = []

        def add_row(a_data=None):
            f = tk.Frame(rows_f, bg=BG_CARD); f.pack(fill=tk.X, pady=2)
            lbl = tk.Label(f, bg=BG_CARD, width=3); lbl.pack(side=tk.LEFT)
            cval = tk.BooleanVar(value=a_data.get('isCorrect', False) if a_data else False)
            tk.Checkbutton(f, variable=cval, bg=BG_CARD).pack(side=tk.LEFT)
            ent = tk.Entry(f, bg=BG_DARK, fg=FG_TEXT, relief=tk.SOLID, borderwidth=1)
            ent.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4)
            if a_data: ent.insert(0, a_data.get('content', ''))
            row_data = {"f": f, "lbl": lbl, "cval": cval, "ent": ent}
            tk.Button(f, text="🗑", bg=BG_CARD, fg=FG_GRAY, relief=tk.FLAT, command=lambda: del_row(row_data)).pack(side=tk.LEFT)
            ans_widgets.append(row_data); update_lbls()

        def del_row(r_data):
            r_data["f"].destroy(); ans_widgets.remove(r_data); update_lbls()
            
        def update_lbls():
            for i, r in enumerate(ans_widgets): r["lbl"].config(text=f"{chr(65+i)}.")

        if question and question.get('answersList'):
            for a in question['answersList']: add_row(a)
        else:
            for _ in range(4): add_row()
        tk.Button(form, text="+ Thêm đáp án", command=add_row).pack(anchor=tk.E)

        tk.Label(form, text="Giải thích", bg=BG_CARD, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        btn_ai_solve = tk.Button(form, text="✨ AI Solve", bg=HIGHLIGHT_COLOR, fg=BTN_PRIMARY)
        btn_ai_solve.pack(anchor=tk.E)
        
        txt_expl = tk.Text(form, height=4, bg=BG_DARK, fg=FG_TEXT, relief=tk.SOLID, borderwidth=1)
        if question: txt_expl.insert("1.0", clean_html_explanation(question.get('explanation', '')))
        txt_expl.pack(fill=tk.X)
        create_img_up(form, "Hình giải thích", "explanation")

        def call_ai():
            q_t = txt_content.get("1.0", tk.END).strip()
            ans_t = [f"{chr(65+i)}. {r['ent'].get().strip()}" for i, r in enumerate(ans_widgets) if r['ent'].get().strip()]
            if not q_t and not self.current_img_state["question"] and not ans_t: return
            btn_ai_solve.config(text="Đang giải...", state=tk.DISABLED)

            def fetch():
                try:
                    model = self.cb_models.get()
                    ep, key = self.get_active_ai_config()
                    full_text = f"Câu hỏi: {q_t}\n\nCác đáp án:\n" + "\n".join(ans_t)
                    
                    if self.current_img_state["question"] and self.current_img_state["question"].startswith("data:image"):
                        # Xài API bóc ảnh
                        img_data = base64.b64decode(self.current_img_state["question"].split(",")[1])
                        data = self.client.analyze_image(Image.open(io.BytesIO(img_data)), model, ep, key)
                    else:
                        # Dùng Cỗ máy Solve chữ 
                        data = self.client.solve_text(full_text, model, ep, key)
                    
                    self.root.after(0, lambda: apply(data))
                except Exception as e:
                    self.root.after(0, lambda: messagebox.showerror("Lỗi", str(e)))
                    self.root.after(0, lambda: btn_ai_solve.config(text="✨ AI Solve", state=tk.NORMAL))

            def apply(data):
                btn_ai_solve.config(text="✨ AI Solve", state=tk.NORMAL)
                
                txt_expl.delete("1.0", tk.END)
                txt_expl.insert("1.0", data.get('explanation', ''))
                
                ai_ans = data.get('answers', [])
                
                # BƯỚC NHẢY ĐỘNG: Thêm hàng nếu AI trả về nhiều hơn (VD: 6 đáp án)
                while len(ans_widgets) < len(ai_ans):
                    add_row()
                    
                # Xóa bớt hàng thừa nếu AI trả về ít hơn (nhưng giữ tối thiểu 2 hàng cho an toàn)
                while len(ans_widgets) > max(len(ai_ans), 2):
                    del_row(ans_widgets[-1])
                
                # Đổ dữ liệu vào đúng số hàng đã căn chỉnh
                for idx, r in enumerate(ans_widgets):
                    r["ent"].delete(0, tk.END)
                    r["cval"].set(False)
                    if idx < len(ai_ans):
                        r["ent"].insert(0, ai_ans[idx].get('content', ''))
                        r["cval"].set(ai_ans[idx].get('isCorrect', False))
            threading.Thread(target=fetch, daemon=True).start()

        btn_ai_solve.config(command=call_ai)

        btn_f = tk.Frame(form, bg=BG_CARD); btn_f.pack(fill=tk.X, pady=20)
        def save():
            c = txt_content.get("1.0", tk.END).strip().replace('\n', '<br>')
            e = txt_expl.get("1.0", tk.END).strip().replace('\n', '<br>')
            if not c: return
            ans = []
            for i, r in enumerate(ans_widgets):
                if r["ent"].get().strip():
                    ans.append({"id":0, "content": r["ent"].get().strip(), "isCorrect": r["cval"].get(), "indexOrder": i, "questionTargetId": 0})
            if len(ans) < 2 or not any(a['isCorrect'] for a in ans): return
            payload = {
                "content": c, "explanation": e, "imageUrl": self.current_img_state["question"],
                "explanationImage": self.current_img_state["explanation"], "quizTargetId": self.selected_quiz_id, "answersList": ans
            }
            if question: payload["id"] = question["id"]
            try: self.client.save_question(payload); on_closing(); self.load_questions()
            except Exception as e: messagebox.showerror("Lỗi", str(e))
            
        tk.Button(btn_f, text="Lưu", bg=BTN_PRIMARY, fg=FG_WHITE, command=save, padx=20).pack(side=tk.RIGHT)

    # --- CLIPBOARD AI WORKFLOW ---
    def toggle_clipboard_monitor(self):
        if not self.client or not self.selected_quiz_id: return
        if self.clipboard_running:
            self.clipboard_running = False
            self.btn_toggle_clip.config(text="BẬT THEO DÕI", bg=BTN_PRIMARY)
            self.log_clip("🛑 Đã DỪNG theo dõi clipboard.")
        else:
            self.clipboard_running = True
            self.btn_toggle_clip.config(text="DỪNG THEO DÕI", bg=BTN_DANGER)
            
            import queue
            if not hasattr(self, 'clip_queue'):
                self.clip_queue = queue.Queue()
            self.is_processing_clip = False
            
            self.log_clip("🟢 Đang THEO DÕI clipboard... Chụp ảnh bằng Win+Shift+S để nạp.")
            threading.Thread(target=self.clipboard_thread, daemon=True).start()

    def clipboard_thread(self):
        self.last_img_bytes = None
        while self.clipboard_running:
            try:
                img = ImageGrab.grabclipboard()
                if isinstance(img, Image.Image):
                    buf = io.BytesIO(); img.save(buf, format="PNG"); ib = buf.getvalue()
                    if self.last_img_bytes is None or ib[:100] != self.last_img_bytes[:100]:
                        self.last_img_bytes = ib
                        
                        # 1. Tự động đưa ảnh mới vào Kho chứa
                        self.clip_queue.put(img.copy())
                        qs = self.clip_queue.qsize()
                        self.root.after(0, lambda q=qs: self.log_clip(f"📸 Đã chụp ảnh mới! Tạm cất vào hàng chờ (Đang đợi: {q} ảnh)."))
                        
                        # 2. Nếu Bot đang rảnh rỗi, đánh thức nó dậy làm việc
                        if not self.is_processing_clip:
                            self.root.after(0, self.process_next_clip)
            except Exception:
                pass
            time.sleep(1.0)

    def process_next_clip(self):
        if not hasattr(self, 'clip_queue') or self.clip_queue.empty():
            self.is_processing_clip = False
            return
            
        self.is_processing_clip = True
        img = self.clip_queue.get()
        qs = self.clip_queue.qsize()
        
        self.log_clip(f"⚙️ Đang gửi AI phân tích 1 ảnh... (Còn lại trong kho: {qs} ảnh)")
        
        # 3. LƯU BASE64: Khôi phục tính năng lưu lại ảnh để đối phó với đề có Bảng Biểu/Hình vẽ
        buffered = io.BytesIO()
        img_to_save = img.copy()
        img_to_save.thumbnail((1024, 1024))
        if img_to_save.mode in ("RGBA", "P"): img_to_save = img_to_save.convert("RGB")
        img_to_save.save(buffered, format="JPEG", quality=85)
        self.current_clip_base64 = f"data:image/jpeg;base64,{base64.b64encode(buffered.getvalue()).decode('utf-8')}"

        model = self.cb_models.get().strip()
        endpoint, key = self.get_active_ai_config() 
        
        def task():
            try:
                res = self.client.analyze_image(img, model, custom_url=endpoint, custom_key=key)
                self.root.after(0, lambda: self.on_clipboard_ai_success(res))
            except Exception as e:
                err_str = str(e)
                self.root.after(0, lambda err=err_str: self.log_clip(f"❌ Lỗi AI: {err}"))
                
                # PHANH AN TOÀN CHỐNG MẤT DỮ LIỆU
                if "402" in err_str:
                    self.root.after(0, lambda: self.log_clip("⛔ Lỗi 402. Đã tạm dừng AI để không làm mất ảnh trong kho!"))
                    self.clip_queue.put(img) 
                    self.is_processing_clip = False 
                elif "429" in err_str or "Rate limit" in err_str:
                    self.root.after(0, lambda: self.log_clip("⏳ Lỗi 429 (Quá tải). Đang đợi 5 giây rồi thử lại..."))
                    time.sleep(5)
                    self.clip_queue.put(img)
                    self.root.after(0, self.process_next_clip)
                else:
                    self.clip_queue.put(img)
                    time.sleep(2)
                    self.root.after(0, self.process_next_clip)
                    
        threading.Thread(target=task, daemon=True).start()

    def on_clipboard_ai_success(self, data):
        self.log_clip("✅ AI bóc tách xong!")
        
        final_q = data.get('question', '')
        self.txt_clip_q.delete("1.0", tk.END)
        self.txt_clip_q.insert("1.0", clean_html_explanation(final_q))
        
        # =======================================================
        # KHÔI PHỤC BỘ LỌC ẢNH THÔNG MINH
        # =======================================================
        text_to_check = final_q.lower()
        visual_keywords = [
            'picture', 'exhibit', 'diagram', 'figure', 'image', 'table', 'graph', 
            'hình', 'bảng', 'sơ đồ', 'biểu đồ', 'đồ thị',
            'refer to', 'topology', 'output omitted', 'match the'
        ]
        
        # Nếu câu hỏi KHÔNG chứa từ khóa hình ảnh VÀ dài hơn 15 ký tự -> Xóa sạch ảnh đính kèm
        if not any(kw in text_to_check for kw in visual_keywords) and len(text_to_check) >= 15:
            self.current_clip_base64 = None
            self.log_clip("✂️ Đã tự động loại bỏ ảnh đính kèm (Câu hỏi chữ thuần túy).")
        else:
            self.log_clip("🖼️ Giữ lại ảnh đính kèm (Phát hiện từ khóa hình/bảng biểu).")
        # =======================================================

        # Ép giao diện vẽ lại đúng số đáp án nhận được (Dù là 2 hay 6)
        self.render_clip_answers(data.get('answers', []))
        
        self.txt_clip_expl.delete("1.0", tk.END)
        self.txt_clip_expl.insert("1.0", data.get('explanation', ''))
        
        if self.val_auto_save.get(): 
            self.log_clip("💾 Đang tự động lưu thẳng vào DB...")
            self.save_clip_preview(silent=True)
        else: 
            self.btn_save_clip_preview.config(state=tk.NORMAL)
            self.is_processing_clip = False
            
    def save_clip_preview(self, silent=False):
        c = clean_html_explanation(self.txt_clip_q.get("1.0", tk.END).strip())
        if not c: 
            self.log_clip("❌ Lỗi: Nội dung câu hỏi rỗng, không thể lưu!")
            if not silent: messagebox.showerror("Lỗi", "Nội dung câu hỏi rỗng!")
            self.is_processing_clip = False
            self.process_next_clip()
            return
            
        ans = [{"id":0,"content":ent.get().strip(),"isCorrect":c_val.get(),"indexOrder":i,"questionTargetId":0} for i, (c_val, ent) in enumerate(self.clip_answers) if ent.get().strip()]
        
        while len(ans) < 2: 
            ans.append({"id":0,"content":"","isCorrect":False,"indexOrder":len(ans),"questionTargetId":0})
            
        # DỊCH VÀ ÉP KIỂU HTML TRƯỚC KHI LƯU VÀO DATABASE
        raw_expl = self.txt_clip_expl.get("1.0", tk.END).strip()
        clean_expl = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', raw_expl, flags=re.DOTALL)
        clean_expl = clean_expl.replace('\n', '<br>')
            
        payload = {
            "content": c, 
            "explanation": clean_expl, # Dùng chuỗi đã được ép HTML ở đây
            "quizTargetId": self.selected_quiz_id, 
            "answersList": ans,
            "imageUrl": getattr(self, 'current_clip_base64', None), 
            "explanationImage": None
        }
        
        def save():
            try: 
                res = self.client.save_question(payload)
                self.root.after(0, lambda: self.on_question_saved_success(res, silent))
            except Exception as e: 
                self.root.after(0, lambda: self.log_clip(f"❌ Lưu thất bại: {e}"))
                self.root.after(0, lambda: setattr(self, 'is_processing_clip', False))
                self.root.after(0, self.process_next_clip)
                
        threading.Thread(target=save, daemon=True).start()

    def on_question_saved_success(self, res, silent):
        self.log_clip(f"🎉 Đã lưu câu hỏi thành công! ID: {res.get('id', '')}")
        self.btn_save_clip_preview.config(state=tk.DISABLED)
        self.load_questions()
        
        # Nếu đang Auto-Save, tự động kéo ảnh tiếp theo trong Kho ra xử lý luôn
        if self.val_auto_save.get():
            self.root.after(500, self.process_next_clip)
        else:
            self.is_processing_clip = False

    # --- BULK IMPORT ---
    def select_bulk_folder(self):
        f = filedialog.askdirectory()
        if not f: return
        self.bulk_folder = f
        self.bulk_files = [x for x in os.listdir(f) if x.lower().endswith((".png", ".jpg", ".jpeg"))]
        for item in self.tree_bulk_files.get_children(): self.tree_bulk_files.delete(item)
        for f in self.bulk_files: self.tree_bulk_files.insert("", tk.END, values=(f, "Chờ"))
        self.lbl_bulk_status.config(text=f"0/{len(self.bulk_files)}")
        self.btn_start_bulk.config(state=tk.NORMAL if self.bulk_files and self.selected_quiz_id else tk.DISABLED)

    def start_bulk_import(self):
        self.btn_start_bulk.config(state=tk.DISABLED)
        self.log_bulk("🚀 Bắt đầu quá trình import hàng loạt...")
        
        def run():
            m, ep, k = self.cb_models.get(), *self.get_active_ai_config()
            for idx, f in enumerate(self.bulk_files):
                self.root.after(0, lambda i=idx: self.update_bulk_file_status(i, "Đang xử lý"))
                
                try:
                    q_data = self.client.analyze_image(Image.open(os.path.join(self.bulk_folder, f)), m, ep, k)
                    ans = [{"id":0,"content":a['content'],"isCorrect":a['isCorrect'],"indexOrder":i,"questionTargetId":0} for i, a in enumerate(q_data['answers'])]
                    while len(ans) < 4: ans.append({"id":0,"content":"","isCorrect":False,"indexOrder":len(ans),"questionTargetId":0})
                    
                    # =========================================================
                    # ÉP KIỂU HTML CHUẨN TRƯỚC KHI LƯU CHO BULK IMPORT
                    # =========================================================
                    raw_expl = q_data.get('explanation', '')
                    # Chuyển ** thành <b>
                    clean_expl = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', raw_expl, flags=re.DOTALL)
                    # Chuyển Enter thành <br>
                    clean_expl = clean_expl.replace('\n', '<br>')

                    payload = {
                        "content": clean_html_explanation(q_data.get('question', '')), 
                        "explanation": clean_expl, # Dùng biến đã được ép HTML chuẩn Web
                        "quizTargetId": self.selected_quiz_id, 
                        "answersList": ans
                    }
                    
                    self.client.save_question(payload)
                    self.root.after(0, lambda i=idx: self.tree_bulk_files.item(self.tree_bulk_files.get_children()[i], values=(f, "Xong")))
                    self.root.after(0, lambda f=f: self.log_bulk(f"✅ Import thành công: {f}"))
                except Exception as e: 
                    self.root.after(0, lambda i=idx: self.tree_bulk_files.item(self.tree_bulk_files.get_children()[i], values=(f, "Lỗi")))
                    self.root.after(0, lambda f=f, err=e: self.log_bulk(f"❌ Thất bại {f}: {err}"))
                    
                self.root.after(0, lambda i=idx: self.lbl_bulk_status.config(text=f"Tiến độ: {i+1}/{len(self.bulk_files)}"))
                time.sleep(1.0) # Nghỉ 1s giữa các ảnh để tránh nghẽn API
                
            self.root.after(0, self.load_questions)
            self.root.after(0, lambda: self.btn_start_bulk.config(state=tk.NORMAL))
            self.root.after(0, lambda: self.log_bulk("🏁 Hoàn tất Bulk Import!"))
            
        threading.Thread(target=run, daemon=True).start()
    # ---------------------------------------------------------
    # TÍNH NĂNG AUTO-BOT & KHOANH VÙNG CHỤP
    # ---------------------------------------------------------
    def toggle_auto_bot(self):
        if hasattr(self, 'bot_running') and self.bot_running:
            self.bot_running = False
            self.btn_start_bot.config(text="ĐANG DỪNG BOT...", bg=BTN_SECONDARY)
            self.log_clip("🛑 Đã nhận lệnh DỪNG. Bot sẽ thoát sau thao tác hiện tại!")
        else:
            self.start_auto_bot()

    def start_auto_bot(self):
        if not self.client or not self.selected_quiz_id:
            messagebox.showwarning("Lỗi", "Vui lòng kết nối và chọn Bộ đề trước khi chạy Bot!")
            return
            
        try:
            total_shots = int(self.ent_bot_count.get().strip())
            delay_sec = float(self.ent_bot_delay.get().strip())
        except ValueError:
            messagebox.showerror("Lỗi", "Vui lòng nhập số hợp lệ!")
            return
            
        import queue
        if not hasattr(self, 'clip_queue'):
            self.clip_queue = queue.Queue()
            self.is_processing_clip = False

        self.bot_running = True
        self.btn_start_bot.config(text="⏹ DỪNG AUTO BOT", bg=BTN_DANGER)
        self.log_clip(f"🤖 BOT KÍCH HOẠT: Cào {total_shots} câu. Đếm ngược 3 GIÂY!")

        def bot_thread():
            for i in range(3, 0, -1):
                if not self.bot_running: break
                self.root.after(0, lambda sec=i: self.log_clip(f"⏳ {sec}s..."))
                time.sleep(1)
                
            if self.bot_running:
                self.root.after(0, lambda: self.log_clip("🚀 BẮT ĐẦU CÀO! KHÔNG CHẠM VÀO CHUỘT/PHÍM!"))
            
            for i in range(total_shots):
                if not self.bot_running: 
                    break 
                    
                try:
                    # 1. Logic chụp ảnh thông minh (Nhận diện vùng cắt)
                    if getattr(self, 'bot_crop_box', None):
                        img = ImageGrab.grab(bbox=self.bot_crop_box)
                    else:
                        img = ImageGrab.grab() 
                    
                    # 2. Ném vào kho
                    self.clip_queue.put(img.copy())
                    qs = self.clip_queue.qsize()
                    self.root.after(0, lambda idx=i+1, q=qs: self.log_clip(f"📸 Cào câu {idx}/{total_shots} (Đợi: {q})."))
                    
                    # 3. Kích hoạt băng chuyền giải AI nếu đang rảnh
                    if not self.is_processing_clip:
                        self.is_processing_clip = True
                        self.root.after(0, self.process_next_clip)
                        
                    # 4. Tự động chuyển câu
                    pyautogui.press('right')
                    time.sleep(delay_sec)
                except Exception as e:
                    self.root.after(0, lambda err=e: self.log_clip(f"❌ Lỗi Bot: {err}"))
                    break
                    
            self.bot_running = False
            self.root.after(0, lambda: self.log_clip("🏁 BOT ĐÃ KẾT THÚC! Vẫn tiếp tục giải ảnh trong Queue..."))
            self.root.after(0, lambda: self.btn_start_bot.config(state=tk.NORMAL, text="▶ BẮT ĐẦU AUTO (Đếm ngược 3s)", bg="#8B5CF6"))

        threading.Thread(target=bot_thread, daemon=True).start()

    def reset_bot_region(self):
        self.bot_crop_box = None
        self.lbl_bot_region.config(text="Toàn màn hình")

    def select_bot_region(self):
        self.root.iconify()
        time.sleep(0.2)
        
        self.snip_win = tk.Toplevel(self.root)
        self.snip_win.attributes('-fullscreen', True)
        self.snip_win.attributes('-alpha', 0.3)
        self.snip_win.config(bg='black')
        self.snip_win.config(cursor="crosshair")
        self.snip_win.attributes('-topmost', True)

        self.snip_canvas = tk.Canvas(self.snip_win, cursor="crosshair", bg="black", highlightthickness=0)
        self.snip_canvas.pack(fill="both", expand=True)

        self.snip_start_x = None
        self.snip_start_y = None
        self.snip_rect = None

        self.snip_canvas.bind("<ButtonPress-1>", self.on_snip_start)
        self.snip_canvas.bind("<B1-Motion>", self.on_snip_drag)
        self.snip_canvas.bind("<ButtonRelease-1>", self.on_snip_release)
        self.snip_win.bind("<Escape>", lambda e: self.cancel_snip())

    def on_snip_start(self, event):
        self.snip_start_x = event.x
        self.snip_start_y = event.y
        self.snip_rect = self.snip_canvas.create_rectangle(self.snip_start_x, self.snip_start_y, self.snip_start_x, self.snip_start_y, outline='#16A34A', width=2, fill="white")

    def on_snip_drag(self, event):
        self.snip_canvas.coords(self.snip_rect, self.snip_start_x, self.snip_start_y, event.x, event.y)

    def on_snip_release(self, event):
        x1 = min(self.snip_start_x, event.x)
        y1 = min(self.snip_start_y, event.y)
        x2 = max(self.snip_start_x, event.x)
        y2 = max(self.snip_start_y, event.y)

        if x2 - x1 > 10 and y2 - y1 > 10:
            self.bot_crop_box = (x1, y1, x2, y2)
            self.lbl_bot_region.config(text=f"Cố định [{x2-x1}x{y2-y1}]")
            self.log_clip(f"🎯 Đã thiết lập vùng chụp cố định: Tọa độ {self.bot_crop_box}")
        else:
            self.reset_bot_region()

        self.snip_win.destroy()
        self.root.deiconify() 
        
    def cancel_snip(self):
        self.snip_win.destroy()
        self.root.deiconify()

if __name__ == "__main__":
    root = tk.Tk()
    app = QuizManagerApp(root)
    root.mainloop()