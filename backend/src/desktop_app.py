import os
import sys
import json
import time
import base64
import io
import re
import threading
import html
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

# Text color on components (white text for colored buttons)
FG_WHITE = "#FFFFFF"

def clean_html_explanation(html_str):
    if not html_str:
        return ""
    
    # 1. Xóa hoàn toàn các block script và style
    html_str = re.sub(r'<style[^>]*>.*?</style>', '', html_str, flags=re.DOTALL)
    html_str = re.sub(r'<script[^>]*>.*?</script>', '', html_str, flags=re.DOTALL)
    
    # 2. XỬ LÝ CÚ PHÁP TOÁN HỌC (MATHJAX/LATEX)
    # Xóa thẻ mở/đóng của công thức toán học \( \) và \[ \]
    html_str = re.sub(r'\\\(\s*', '', html_str)
    html_str = re.sub(r'\s*\\\)', '', html_str)
    html_str = re.sub(r'\\\[\s*', '', html_str)
    html_str = re.sub(r'\s*\\\]', '', html_str)
    
    # Dịch các toán tử LaTeX phổ biến sang ký tự Unicode dễ đọc
    latex_to_unicode = {
        r'\\times': '×',
        r'\\div': '÷',
        r'\\rightarrow': '→',
        r'\\leftarrow': '←',
        r'\\pmod\s*\{([^}]+)\}': r'mod \1',  # Xử lý \pmod{7} thành mod 7
        r'\\pmod\s*': 'mod ',                # Xử lý \pmod 7 thành mod 7
        r'\\equiv': '≡',
        r'\\approx': '≈',
        r'\\leq?': '≤',
        r'\\geq?': '≥',
        r'\\neq': '≠',
        r'\\pm': '±',
        r'\\infty': '∞',
        r'\\cdot': '·',
    }
    for pattern, replacement in latex_to_unicode.items():
        html_str = re.sub(pattern, replacement, html_str)
        
    # Xử lý chỉ số dưới (Subscript) và chỉ số trên (Superscript)
    # Ví dụ: x_{1} thành x_1, x^{2} thành x^2
    html_str = re.sub(r'_\{([a-zA-Z0-9]+)\}', r'_\1', html_str)
    html_str = re.sub(r'\^\{([a-zA-Z0-9]+)\}', r'^\1', html_str)
    # Nếu trong ngoặc nhọn là biểu thức dài (VD: x_{n-1}), đổi sang ngoặc tròn: x_(n-1)
    html_str = re.sub(r'_\{([^}]+)\}', r'_(\1)', html_str)
    html_str = re.sub(r'\^\{([^}]+)\}', r'^(\1)', html_str)

    # 3. Chuyển đổi các thẻ cấu trúc sang ký tự Plain Text/Markdown
    html_str = re.sub(r'<br\s*/?>', '\n', html_str, flags=re.IGNORECASE)
    html_str = re.sub(r'</p>', '\n\n', html_str, flags=re.IGNORECASE)
    html_str = re.sub(r'<li[^>]*>', '\n• ', html_str, flags=re.IGNORECASE)
    
    html_str = re.sub(r'<b[^>]*>(.*?)</b>', r'**\1**', html_str, flags=re.IGNORECASE | re.DOTALL)
    html_str = re.sub(r'<strong[^>]*>(.*?)</strong>', r'**\1**', html_str, flags=re.IGNORECASE | re.DOTALL)
    html_str = re.sub(r'<code[^>]*>(.*?)</code>', r'`\1`', html_str, flags=re.IGNORECASE | re.DOTALL)
    
    # 4. Quét sạch toàn bộ các thẻ HTML rác còn lại
    cleaned = re.sub(r'<[^>]+>', '', html_str)
    
    # 5. Decode HTML Entities (Ví dụ: &nbsp; -> [dấu cách])
    cleaned = html.unescape(cleaned)
    
    # 6. Dọn dẹp khoảng trắng
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    
    return cleaned.strip()

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
            if r.status_code == 200:
                return r.json()
            print(f"[XÁC THỰC THẤT BẠI] Status code: {r.status_code}, Response: {r.text}")
            return None
        except Exception as e:
            print(f"[LỖI KẾT NỐI] {type(e).__name__}: {e}")
            return None

    def get_models(self, custom_url=None, custom_key=None):
        headers = self._headers()
        if custom_url:
            headers["X-LiteLLM-URL"] = custom_url
        if custom_key:
            headers["X-LiteLLM-Key"] = custom_key
        try:
            r = requests.get(f"{self.base_url}/api/ai/models", headers=headers, timeout=5)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
            
        # Direct fallback
        if custom_url:
            try:
                direct_headers = {}
                if custom_key:
                    direct_headers["Authorization"] = f"Bearer {custom_key}"
                r = requests.get(f"{custom_url}/v1/models", headers=direct_headers, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    return [m['id'] for m in data.get('data', [])]
            except Exception:
                pass
                
        return ["gemini/gemini-1.5-flash", "gemini/gemini-1.5-pro", "openai/gpt-4o-mini", "openai/gpt-4o"]

    # Subjects CRUD
    def get_subjects(self):
        r = requests.get(f"{self.base_url}/api/subjects", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def save_subject(self, code, name, subject_id=None):
        payload = {"code": code.upper(), "name": name}
        if subject_id:
            payload["id"] = subject_id
        r = requests.post(f"{self.base_url}/api/subjects", json=payload, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def delete_subject(self, subject_id):
        r = requests.delete(f"{self.base_url}/api/subjects/{subject_id}", headers=self._headers())
        r.raise_for_status()
        return r.json()

    # Quizzes CRUD
    def get_quizzes(self, subject_id):
        r = requests.get(f"{self.base_url}/api/subjects/{subject_id}/quizzes", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def save_quiz(self, name, subject_id, quiz_id=None):
        payload = {"name": name, "subjectTargetId": subject_id}
        if quiz_id:
            payload["id"] = quiz_id
        r = requests.post(f"{self.base_url}/api/quizzes", json=payload, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def delete_quiz(self, quiz_id):
        r = requests.delete(f"{self.base_url}/api/quizzes/{quiz_id}", headers=self._headers())
        r.raise_for_status()
        return r.json()

    # Questions CRUD
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

    # AI Analyzer
    def analyze_image(self, img_pil, model, custom_url=None, custom_key=None):
        buffered = io.BytesIO()
        img_pil.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        payload = {
            "imageBase64": img_base64,
            "model": model
        }
        headers = self._headers()
        if custom_url:
            headers["X-LiteLLM-URL"] = custom_url
        if custom_key:
            headers["X-LiteLLM-Key"] = custom_key
            
        r = requests.post(f"{self.base_url}/api/ai/analyze-image", json=payload, headers=headers)
        r.raise_for_status()
        return r.json()


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
        
        # Clipboard state
        self.clipboard_running = False
        self.last_img_bytes = None
        self.preview_image = None
        self.parsed_ai_data = None

        self.load_local_config()
        self.setup_styles()
        self.build_ui()
        
        # Try auto connecting if configs are present
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
            except Exception:
                pass

    def save_local_config(self):
        try:
            with open("config.json", "w", encoding="utf-8") as f:
                json.dump({
                    "server_url": self.server_url,
                    "api_token": self.api_token,
                    "model": self.model_name,
                    "ai_endpoint": self.ai_endpoint,
                    "ai_key": self.ai_key
                }, f, indent=4)
        except Exception:
            pass

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        
        # Configure frames and elements
        style.configure(".", background=BG_DARK, foreground=FG_TEXT, font=("Segoe UI", 10))
        style.configure("TFrame", background=BG_DARK)
        
        # Treeview Custom Styles
        style.configure("Treeview", 
                        background=BG_CARD, 
                        foreground=FG_TEXT, 
                        fieldbackground=BG_CARD, 
                        borderwidth=0,
                        rowheight=28)
        style.map("Treeview", 
                  background=[("selected", HIGHLIGHT_COLOR)],
                  foreground=[("selected", FG_TEXT)])
        style.configure("Treeview.Heading", 
                        background=BG_INPUT, 
                        foreground=FG_TEXT, 
                        borderwidth=0, 
                        font=("Segoe UI", 10, "bold"))

        # Notebook Custom Styles
        style.configure("TNotebook", background=BG_DARK, borderwidth=0)
        style.configure("TNotebook.Tab", background=BG_CARD, foreground=FG_GRAY, padding=[12, 6], font=("Segoe UI", 10, "bold"))
        style.map("TNotebook.Tab", background=[("selected", BG_DARK)], foreground=[("selected", FG_TEXT)])

    def build_ui(self):
        # Top Header Area
        header_frame = tk.Frame(self.root, bg=BG_CARD, height=60)
        header_frame.pack(fill=tk.X, side=tk.TOP)
        header_frame.pack_propagate(False)

        lbl_title = tk.Label(header_frame, text="⚡ AZUKI E-LEARNING ADMIN CONSOLE", fg=FG_TEXT, bg=BG_CARD, font=("Segoe UI", 14, "bold"))
        lbl_title.pack(side=tk.LEFT, padx=20, pady=15)
        
        self.lbl_status = tk.Label(header_frame, text="🔴 Chưa kết nối", fg=BTN_DANGER, bg=BG_CARD, font=("Segoe UI", 10, "bold"))
        self.lbl_status.pack(side=tk.RIGHT, padx=20, pady=15)

        # Tabs Layout
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # Setup 4 Main tabs
        self.tab_conn = ttk.Frame(self.notebook)
        self.tab_lib = ttk.Frame(self.notebook)
        self.tab_clip = ttk.Frame(self.notebook)
        self.tab_bulk = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_conn, text="🔌 Kết Nối & Cài Đặt")
        self.notebook.add(self.tab_lib, text="🗂️ Thư Viện Môn Học")
        self.notebook.add(self.tab_clip, text="📷 Clipboard AI")
        self.notebook.add(self.tab_bulk, text="📂 Bulk Import")

        self.build_conn_tab()
        self.build_lib_tab()
        self.build_clip_tab()
        self.build_bulk_tab()

    # --- TABS BUILDERS ---

    def build_conn_tab(self):
        container = tk.Frame(self.tab_conn, bg=BG_DARK)
        container.place(relx=0.5, rely=0.5, anchor=tk.CENTER)

        card = tk.Frame(container, bg=BG_CARD, padx=30, pady=30, highlightbackground=BORDER_COLOR, highlightthickness=1)
        card.pack()

        tk.Label(card, text="CẤU HÌNH KẾT NỐI SERVER & AI", fg=FG_TEXT, bg=BG_CARD, font=("Segoe UI", 12, "bold")).grid(row=0, columnspan=2, pady=(0, 20))

        # Server URL API
        tk.Label(card, text="Server URL API:", fg=FG_GRAY, bg=BG_CARD).grid(row=1, column=0, sticky=tk.W, pady=5)
        self.ent_url = tk.Entry(card, width=40, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, borderwidth=1, relief=tk.FLAT)
        self.ent_url.insert(0, self.server_url)
        self.ent_url.grid(row=1, column=1, pady=5, padx=10)

        # API Token
        tk.Label(card, text="API Token (JWT):", fg=FG_GRAY, bg=BG_CARD).grid(row=2, column=0, sticky=tk.W, pady=5)
        self.ent_token = tk.Entry(card, width=40, show="*", bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        self.ent_token.insert(0, self.api_token)
        self.ent_token.grid(row=2, column=1, pady=5, padx=10)

        # AI Endpoint
        tk.Label(card, text="AI Endpoint (LiteLLM):", fg=FG_GRAY, bg=BG_CARD).grid(row=3, column=0, sticky=tk.W, pady=5)
        self.ent_ai_endpoint = tk.Entry(card, width=40, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        self.ent_ai_endpoint.insert(0, self.ai_endpoint)
        self.ent_ai_endpoint.grid(row=3, column=1, pady=5, padx=10)

        # LiteLLM Key
        tk.Label(card, text="Key LiteLLM:", fg=FG_GRAY, bg=BG_CARD).grid(row=4, column=0, sticky=tk.W, pady=5)
        self.ent_ai_key = tk.Entry(card, width=40, show="*", bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        self.ent_ai_key.insert(0, self.ai_key)
        self.ent_ai_key.grid(row=4, column=1, pady=5, padx=10)

        # Default AI Model selection
        tk.Label(card, text="Model AI mặc định:", fg=FG_GRAY, bg=BG_CARD).grid(row=5, column=0, sticky=tk.W, pady=5)
        self.cb_models = ttk.Combobox(card, values=[self.model_name], width=37)
        self.cb_models.set(self.model_name)
        self.cb_models.grid(row=5, column=1, pady=5, padx=10)

        # Connect & Scan buttons
        btn_frame = tk.Frame(card, bg=BG_CARD)
        btn_frame.grid(row=6, columnspan=2, pady=(20, 0))

        btn_scan = tk.Button(btn_frame, text="Quét & Cập Nhật Model", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), padx=10, pady=6, command=self.scan_models)
        btn_scan.pack(side=tk.LEFT, padx=5)

        btn_conn = tk.Button(btn_frame, text="Kết Nối Đến Server", bg=BTN_PRIMARY, fg=FG_WHITE, activebackground=HIGHLIGHT_COLOR, activeforeground=FG_TEXT, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), padx=15, pady=6, command=self.connect_server)
        btn_conn.pack(side=tk.LEFT, padx=5)

    def build_lib_tab(self):
        paned = tk.PanedWindow(self.tab_lib, orient=tk.HORIZONTAL, bg=BORDER_COLOR, bd=0)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 1. Subjects Frame
        f_sub = tk.Frame(paned, bg=BG_DARK, width=280)
        tk.Label(f_sub, text="📖 Danh Sách Môn Học", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        
        self.tree_sub = ttk.Treeview(f_sub, columns=("code", "name"), show="headings")
        self.tree_sub.heading("code", text="Mã Môn")
        self.tree_sub.heading("name", text="Tên Môn Học")
        self.tree_sub.column("code", width=80, anchor=tk.CENTER)
        self.tree_sub.column("name", width=180)
        self.tree_sub.pack(fill=tk.BOTH, expand=True)
        self.tree_sub.bind("<<TreeviewSelect>>", self.on_subject_select)

        btns_sub = tk.Frame(f_sub, bg=BG_DARK, pady=5)
        btns_sub.pack(fill=tk.X)
        tk.Button(btns_sub, text="Thêm", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=self.add_subject_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_sub, text="Sửa", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, command=self.edit_subject_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_sub, text="Xóa", bg=BTN_DANGER, fg=FG_WHITE, relief=tk.FLAT, command=self.delete_subject).pack(side=tk.LEFT, padx=2)

        # 2. Quizzes Frame
        f_quiz = tk.Frame(paned, bg=BG_DARK, width=280)
        tk.Label(f_quiz, text="📝 Bộ Đề Trắc Nghiệm", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        
        self.tree_quiz = ttk.Treeview(f_quiz, columns=("name",), show="headings")
        self.tree_quiz.heading("name", text="Tên Bộ Đề")
        self.tree_quiz.column("name", width=250)
        self.tree_quiz.pack(fill=tk.BOTH, expand=True)
        self.tree_quiz.bind("<<TreeviewSelect>>", self.on_quiz_select)

        btns_quiz = tk.Frame(f_quiz, bg=BG_DARK, pady=5)
        btns_quiz.pack(fill=tk.X)
        tk.Button(btns_quiz, text="Thêm", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=self.add_quiz_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_quiz, text="Sửa", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, command=self.edit_quiz_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_quiz, text="Xóa", bg=BTN_DANGER, fg=FG_WHITE, relief=tk.FLAT, command=self.delete_quiz).pack(side=tk.LEFT, padx=2)

        # 3. Questions Frame
        f_q = tk.Frame(paned, bg=BG_DARK, width=540)
        tk.Label(f_q, text="❓ Danh Sách Câu Hỏi", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=5)
        
        self.tree_q = ttk.Treeview(f_q, columns=("content",), show="headings")
        self.tree_q.heading("content", text="Nội Dung Câu Hỏi")
        self.tree_q.column("content", width=500)
        self.tree_q.pack(fill=tk.BOTH, expand=True)

        btns_q = tk.Frame(f_q, bg=BG_DARK, pady=5)
        btns_q.pack(fill=tk.X)
        tk.Button(btns_q, text="Thêm Câu Hỏi", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=self.add_question_dialog, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_q, text="Sửa", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, command=self.edit_question_dialog).pack(side=tk.LEFT, padx=2)
        tk.Button(btns_q, text="Xóa", bg=BTN_DANGER, fg=FG_WHITE, relief=tk.FLAT, command=self.delete_question).pack(side=tk.LEFT, padx=2)

        paned.add(f_sub)
        paned.add(f_quiz)
        paned.add(f_q)

    def build_clip_tab(self):
        paned = tk.PanedWindow(self.tab_clip, orient=tk.HORIZONTAL, bg=BORDER_COLOR, bd=0)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Left side: Controllers
        left_f = tk.Frame(paned, bg=BG_DARK, width=380, padx=10)
        tk.Label(left_f, text="CLIPBOARD AI MONITOR", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)

        # Subject & Quiz selection labels
        self.lbl_clip_target = tk.Label(left_f, text="⚠️ Chưa chọn Bộ đề để nạp câu hỏi", bg=BG_DARK, fg=BTN_DANGER, wraplength=350, justify=tk.LEFT, font=("Segoe UI", 10, "bold"))
        self.lbl_clip_target.pack(anchor=tk.W, pady=5)

        self.btn_toggle_clip = tk.Button(left_f, text="BẬT CLIPBOARD MONITOR", bg=BTN_PRIMARY, fg=FG_WHITE, font=("Segoe UI", 10, "bold"), relief=tk.FLAT, height=2, command=self.toggle_clipboard_monitor)
        self.btn_toggle_clip.pack(fill=tk.X, pady=10)

        self.val_auto_save = tk.BooleanVar(value=False)
        chk_autosave = tk.Checkbutton(left_f, text="Tự động lưu vào Database không cần xác nhận", variable=self.val_auto_save, bg=BG_DARK, fg=FG_TEXT, activebackground=BG_DARK, selectcolor=BG_INPUT, activeforeground=FG_TEXT)
        chk_autosave.pack(anchor=tk.W, pady=5)

        # Logs area
        tk.Label(left_f, text="Nhật ký hoạt động:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=(15, 2))
        self.txt_clip_logs = tk.Text(left_f, height=18, width=45, bg=BG_INPUT, fg=FG_TEXT, borderwidth=1, relief=tk.FLAT, font=("Consolas", 9), insertbackground=FG_TEXT)
        self.txt_clip_logs.pack(fill=tk.BOTH, expand=True, pady=5)

        # Right side: AI Review and Edit Panel
        right_f = tk.Frame(paned, bg=BG_DARK, padx=10)
        tk.Label(right_f, text="Xem Trước Kết Quả Phân Tích AI", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)

        # Question editor fields
        scroll_c = tk.Canvas(right_f, bg=BG_DARK, bd=0, highlightthickness=0)
        scroll_c.pack(fill=tk.BOTH, expand=True)

        scrollbar = ttk.Scrollbar(right_f, orient="vertical", command=scroll_c.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        scroll_c.configure(yscrollcommand=scrollbar.set)

        self.inner_review_f = tk.Frame(scroll_c, bg=BG_DARK)
        scroll_c.create_window((0, 0), window=self.inner_review_f, anchor=tk.NW)
        self.inner_review_f.bind("<Configure>", lambda e: scroll_c.configure(scrollregion=scroll_c.bbox("all")))

        tk.Label(self.inner_review_f, text="Câu hỏi:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=2)
        self.txt_clip_q = tk.Text(self.inner_review_f, height=4, width=80, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT, insertbackground=FG_TEXT)
        self.txt_clip_q.pack(fill=tk.X, pady=2)

        tk.Label(self.inner_review_f, text="Danh sách đáp án (Tick để chọn đáp án đúng):", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=10)
        
        self.clip_answers = []
        for i in range(4):
            f_ans = tk.Frame(self.inner_review_f, bg=BG_DARK)
            f_ans.pack(fill=tk.X, pady=2)
            
            lbl_order = tk.Label(f_ans, text=f"{chr(65+i)}.", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 10, "bold"))
            lbl_order.pack(side=tk.LEFT, padx=(0, 5))
            
            c_val = tk.BooleanVar(value=False)
            chk = tk.Checkbutton(f_ans, variable=c_val, bg=BG_DARK, selectcolor=BG_INPUT)
            chk.pack(side=tk.LEFT)
            
            ent = tk.Entry(f_ans, width=65, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
            ent.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
            self.clip_answers.append((c_val, ent))

        tk.Label(self.inner_review_f, text="Giải thích chi tiết:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=(10, 2))
        self.txt_clip_expl = tk.Text(self.inner_review_f, height=6, width=80, bg=BG_INPUT, fg=FG_TEXT, relief=tk.FLAT, insertbackground=FG_TEXT)
        self.txt_clip_expl.pack(fill=tk.X, pady=2)

        # Review action buttons
        self.btn_save_clip_preview = tk.Button(self.inner_review_f, text="Lưu Lại Câu Hỏi Này", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), pady=6, command=self.save_clip_preview, state=tk.DISABLED)
        self.btn_save_clip_preview.pack(fill=tk.X, pady=15)

        paned.add(left_f)
        paned.add(right_f)

    def build_bulk_tab(self):
        paned = tk.PanedWindow(self.tab_bulk, orient=tk.HORIZONTAL, bg=BORDER_COLOR, bd=0)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Left Column: Configuration and control
        left_f = tk.Frame(paned, bg=BG_DARK, width=380, padx=10)
        tk.Label(left_f, text="BULK IMAGE AUTO-IMPORT", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)

        self.lbl_bulk_target = tk.Label(left_f, text="⚠️ Chưa chọn Bộ đề để nạp câu hỏi", bg=BG_DARK, fg=BTN_DANGER, wraplength=350, justify=tk.LEFT, font=("Segoe UI", 10, "bold"))
        self.lbl_bulk_target.pack(anchor=tk.W, pady=5)

        tk.Button(left_f, text="Chọn Thư Mục Ảnh", bg=BTN_SECONDARY, fg=FG_WHITE, relief=tk.FLAT, font=("Segoe UI", 10, "bold"), command=self.select_bulk_folder).pack(fill=tk.X, pady=10)

        self.btn_start_bulk = tk.Button(left_f, text="BẮT ĐẦU IMPORT HÀNG LOẠT", bg=BTN_SUCCESS, fg=FG_WHITE, font=("Segoe UI", 10, "bold"), relief=tk.FLAT, height=2, state=tk.DISABLED, command=self.start_bulk_import)
        self.btn_start_bulk.pack(fill=tk.X, pady=10)

        # Progress bar
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(left_f, variable=self.progress_var, maximum=100)
        self.progress_bar.pack(fill=tk.X, pady=10)

        # Status text
        self.lbl_bulk_status = tk.Label(left_f, text="Số lượng ảnh: 0/0", bg=BG_DARK, fg=FG_GRAY)
        self.lbl_bulk_status.pack(anchor=tk.W)

        # Logs
        tk.Label(left_f, text="Nhật ký bulk import:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, pady=(15, 2))
        self.txt_bulk_logs = tk.Text(left_f, height=18, width=45, bg=BG_INPUT, fg=FG_TEXT, borderwidth=1, relief=tk.FLAT, font=("Consolas", 9), insertbackground=FG_TEXT)
        self.txt_bulk_logs.pack(fill=tk.BOTH, expand=True, pady=5)

        # Right Column: List of Images inside Folder
        right_f = tk.Frame(paned, bg=BG_DARK, padx=10)
        tk.Label(right_f, text="Danh Sách Ảnh Đã Quét", bg=BG_DARK, fg=FG_TEXT, font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=10)

        self.tree_bulk_files = ttk.Treeview(right_f, columns=("name", "status"), show="headings")
        self.tree_bulk_files.heading("name", text="Tên File Ảnh")
        self.tree_bulk_files.heading("status", text="Trạng Thái")
        self.tree_bulk_files.column("name", width=400)
        self.tree_bulk_files.column("status", width=150, anchor=tk.CENTER)
        self.tree_bulk_files.pack(fill=tk.BOTH, expand=True)

        paned.add(left_f)
        paned.add(right_f)

    # --- ACTIONS & LOGIC ---

    def log_clip(self, message):
        self.txt_clip_logs.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {message}\n")
        self.txt_clip_logs.see(tk.END)

    def log_bulk(self, message):
        self.txt_bulk_logs.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {message}\n")
        self.txt_bulk_logs.see(tk.END)

    def connect_server(self, silent=False):
        url = self.ent_url.get().strip()
        token = self.ent_token.get().strip()
        
        if not url or not token:
            if not silent:
                messagebox.showerror("Lỗi", "Vui lòng nhập Server URL và API Token!")
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
                
                # Fetch models via client with custom endpoints/keys if configured
                models = self.client.get_models(self.ai_endpoint, self.ai_key)
                
                # Update UI
                self.root.after(0, lambda: self.on_connection_success(user, models, silent))
            else:
                self.root.after(0, lambda: self.on_connection_failure(silent))

        threading.Thread(target=check, daemon=True).start()

    def on_connection_success(self, user, models, silent):
        self.lbl_status.config(text=f"🟢 Đã đăng nhập: {user.get('name', 'Admin')}", fg=BTN_SUCCESS)
        self.cb_models.config(values=models)
        if models:
            self.cb_models.set(models[0])
            self.model_name = models[0]
        
        if not silent:
            messagebox.showinfo("Thành Công", f"Đã kết nối thành công đến Server!\nChào mừng {user.get('name')}!")
        
        self.load_subjects()

    def on_connection_failure(self, silent):
        self.lbl_status.config(text="🔴 Kết nối thất bại", fg=BTN_DANGER)
        self.client = None
        if not silent:
            messagebox.showerror("Thất bại", "Không thể kết nối đến server. Vui lòng kiểm tra lại URL và Token!")

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
            client = self.client
            if not client:
                client = APIClient(self.ent_url.get().strip(), self.ent_token.get().strip())
            
            models = client.get_models(self.ai_endpoint, self.ai_key)
            if models:
                self.root.after(0, lambda: self.on_models_scanned(models))
            else:
                self.root.after(0, lambda: messagebox.showerror("Lỗi", "Không thể lấy danh sách model từ Endpoint này! Vui lòng kiểm tra lại URL/Key."))
                
        threading.Thread(target=scan, daemon=True).start()
        
    def on_models_scanned(self, models):
        self.cb_models.config(values=models)
        if models:
            self.cb_models.set(models[0])
            self.model_name = models[0]
            self.save_local_config()
        messagebox.showinfo("Thành Công", f"Đã quét thành công! Tìm thấy {len(models)} model.")

    # Load subjects
    def load_subjects(self):
        if not self.client:
            return
        
        # Clear subjects list
        for item in self.tree_sub.get_children():
            self.tree_sub.delete(item)
        # Clear quizzes
        for item in self.tree_quiz.get_children():
            self.tree_quiz.delete(item)
        # Clear questions
        for item in self.tree_q.get_children():
            self.tree_q.delete(item)
            
        self.selected_subject_id = None
        self.selected_quiz_id = None
        self.update_target_labels()

        def load():
            try:
                self.subjects = self.client.get_subjects()
                self.root.after(0, self.display_subjects)
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Lỗi", f"Không thể tải môn học: {e}"))
        
        threading.Thread(target=load, daemon=True).start()

    def display_subjects(self):
        for s in self.subjects:
            self.tree_sub.insert("", tk.END, iid=s['id'], values=(s['code'], s['name']))

    def on_subject_select(self, event):
        sel = self.tree_sub.selection()
        if not sel:
            return
        self.selected_subject_id = int(sel[0])
        self.selected_quiz_id = None
        self.update_target_labels()
        self.load_quizzes()

    # Load quizzes
    def load_quizzes(self):
        for item in self.tree_quiz.get_children():
            self.tree_quiz.delete(item)
        for item in self.tree_q.get_children():
            self.tree_q.delete(item)
            
        if not self.selected_subject_id:
            return

        def load():
            try:
                self.quizzes = self.client.get_quizzes(self.selected_subject_id)
                self.root.after(0, self.display_quizzes)
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Lỗi", f"Không thể tải bộ đề: {e}"))
        
        threading.Thread(target=load, daemon=True).start()

    def display_quizzes(self):
        for q in self.quizzes:
            self.tree_quiz.insert("", tk.END, iid=q['id'], values=(q['name'],))

    def on_quiz_select(self, event):
        sel = self.tree_quiz.selection()
        if not sel:
            return
        self.selected_quiz_id = int(sel[0])
        self.update_target_labels()
        self.load_questions()

    def update_target_labels(self):
        sub_name = ""
        quiz_name = ""
        
        if self.selected_subject_id:
            s_obj = next((s for s in self.subjects if s['id'] == self.selected_subject_id), None)
            if s_obj:
                sub_name = s_obj['code']
                
        if self.selected_quiz_id:
            q_obj = next((q for q in self.quizzes if q['id'] == self.selected_quiz_id), None)
            if q_obj:
                quiz_name = q_obj['name']

        if self.selected_quiz_id:
            target_str = f"🎯 Đang nạp vào: Môn {sub_name} → Bộ đề: {quiz_name}"
            self.lbl_clip_target.config(text=target_str, fg=BTN_SUCCESS)
            self.lbl_bulk_target.config(text=target_str, fg=BTN_SUCCESS)
            self.btn_start_bulk.config(state=tk.NORMAL)
        else:
            self.lbl_clip_target.config(text="⚠️ Chưa chọn Bộ đề để nạp câu hỏi", fg=BTN_DANGER)
            self.lbl_bulk_target.config(text="⚠️ Chưa chọn Bộ đề để nạp câu hỏi", fg=BTN_DANGER)
            self.btn_start_bulk.config(state=tk.DISABLED)

    # Load questions
    def load_questions(self):
        for item in self.tree_q.get_children():
            self.tree_q.delete(item)
            
        if not self.selected_quiz_id:
            return

        def load():
            try:
                self.questions = self.client.get_questions(self.selected_quiz_id)
                self.root.after(0, self.display_questions)
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Lỗi", f"Không thể tải câu hỏi: {e}"))
        
        threading.Thread(target=load, daemon=True).start()

    def display_questions(self):
        for q in self.questions:
            self.tree_q.insert("", tk.END, iid=q['id'], values=(q['content'],))

    # --- CRUD DIALOGS ---

    def add_subject_dialog(self):
        if not self.client:
            return
        
        d = tk.Toplevel(self.root)
        d.title("Thêm Môn Học Mới")
        d.geometry("380x220")
        d.configure(bg=BG_DARK)
        d.transient(self.root)
        d.grab_set()

        tk.Label(d, text="Mã môn học (Ví dụ: SWE301, MAD101):", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=(15, 2))
        ent_code = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        ent_code.pack(fill=tk.X, padx=15, pady=2)

        tk.Label(d, text="Tên môn học:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=(10, 2))
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            code = ent_code.get().strip()
            name = ent_name.get().strip()
            if not code or not name:
                messagebox.showerror("Lỗi", "Vui lòng nhập đầy đủ mã và tên môn!")
                return
            try:
                self.client.save_subject(code, name)
                d.destroy()
                self.load_subjects()
            except Exception as e:
                messagebox.showerror("Lỗi", f"Không thể lưu môn học: {e}")

        tk.Button(d, text="Lưu môn học", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=save, pady=5).pack(fill=tk.X, padx=15, pady=20)

    def edit_subject_dialog(self):
        if not self.selected_subject_id:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn môn học để sửa!")
            return
        s_obj = next((s for s in self.subjects if s['id'] == self.selected_subject_id), None)
        if not s_obj:
            return

        d = tk.Toplevel(self.root)
        d.title("Sửa Môn Học")
        d.geometry("380x220")
        d.configure(bg=BG_DARK)
        d.transient(self.root)
        d.grab_set()

        tk.Label(d, text="Mã môn học:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=(15, 2))
        ent_code = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        ent_code.insert(0, s_obj['code'])
        ent_code.pack(fill=tk.X, padx=15, pady=2)

        tk.Label(d, text="Tên môn học:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=(10, 2))
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        ent_name.insert(0, s_obj['name'])
        ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            code = ent_code.get().strip()
            name = ent_name.get().strip()
            if not code or not name:
                messagebox.showerror("Lỗi", "Vui lòng nhập đầy đủ mã và tên môn!")
                return
            try:
                self.client.save_subject(code, name, self.selected_subject_id)
                d.destroy()
                self.load_subjects()
            except Exception as e:
                messagebox.showerror("Lỗi", f"Không thể lưu môn học: {e}")

        tk.Button(d, text="Lưu thay đổi", bg=BTN_PRIMARY, fg=FG_WHITE, relief=tk.FLAT, command=save, pady=5).pack(fill=tk.X, padx=15, pady=20)

    def delete_subject(self):
        if not self.selected_subject_id:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn môn học cần xóa!")
            return
        if not messagebox.askyesno("Xác nhận", "Bạn có chắc chắn muốn xóa môn học này? Mọi bộ đề thuộc môn học này cũng sẽ bị xóa."):
            return
        try:
            self.client.delete_subject(self.selected_subject_id)
            self.load_subjects()
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể xóa môn học: {e}")

    def add_quiz_dialog(self):
        if not self.selected_subject_id:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn Môn học trước!")
            return

        d = tk.Toplevel(self.root)
        d.title("Tạo Bộ Đề Mới")
        d.geometry("380x150")
        d.configure(bg=BG_DARK)
        d.transient(self.root)
        d.grab_set()

        tk.Label(d, text="Tên bộ đề trắc nghiệm:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=(15, 2))
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            name = ent_name.get().strip()
            if not name:
                messagebox.showerror("Lỗi", "Vui lòng nhập tên bộ đề!")
                return
            try:
                self.client.save_quiz(name, self.selected_subject_id)
                d.destroy()
                self.load_quizzes()
            except Exception as e:
                messagebox.showerror("Lỗi", f"Không thể lưu bộ đề: {e}")

        tk.Button(d, text="Lưu bộ đề", bg=BTN_SUCCESS, fg=FG_WHITE, relief=tk.FLAT, command=save, pady=5).pack(fill=tk.X, padx=15, pady=15)

    def edit_quiz_dialog(self):
        if not self.selected_quiz_id:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn bộ đề để sửa!")
            return
        q_obj = next((q for q in self.quizzes if q['id'] == self.selected_quiz_id), None)
        if not q_obj:
            return

        d = tk.Toplevel(self.root)
        d.title("Sửa Bộ Đề")
        d.geometry("380x150")
        d.configure(bg=BG_DARK)
        d.transient(self.root)
        d.grab_set()

        tk.Label(d, text="Tên bộ đề trắc nghiệm:", bg=BG_DARK, fg=FG_GRAY).pack(anchor=tk.W, padx=15, pady=(15, 2))
        ent_name = tk.Entry(d, bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.FLAT)
        ent_name.insert(0, q_obj['name'])
        ent_name.pack(fill=tk.X, padx=15, pady=2)

        def save():
            name = ent_name.get().strip()
            if not name:
                messagebox.showerror("Lỗi", "Vui lòng nhập tên bộ đề!")
                return
            try:
                self.client.save_quiz(name, self.selected_subject_id, self.selected_quiz_id)
                d.destroy()
                self.load_quizzes()
            except Exception as e:
                messagebox.showerror("Lỗi", f"Không thể lưu bộ đề: {e}")

        tk.Button(d, text="Lưu thay đổi", bg=BTN_PRIMARY, fg=FG_WHITE, relief=tk.FLAT, command=save, pady=5).pack(fill=tk.X, padx=15, pady=15)

    def delete_quiz(self):
        if not self.selected_quiz_id:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn bộ đề cần xóa!")
            return
        if not messagebox.askyesno("Xác nhận", "Bạn có chắc chắn muốn xóa bộ đề này? Mọi câu hỏi bên trong sẽ bị xóa."):
            return
        try:
            self.client.delete_quiz(self.selected_quiz_id)
            self.load_quizzes()
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể xóa bộ đề: {e}")

    # Question editor dialog
    def add_question_dialog(self):
        if not self.selected_quiz_id:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn bộ đề để thêm câu hỏi!")
            return
        
        # Tính số thứ tự của câu hỏi mới (bằng tổng số câu hiện tại + 1)
        next_idx = len(self.tree_q.get_children()) + 1
        self.question_editor_window(question=None, q_index=next_idx)

    def edit_question_dialog(self):
        sel = self.tree_q.selection()
        if not sel:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn câu hỏi để sửa!")
            return
        q_id = int(sel[0])
        q_obj = next((q for q in self.questions if q['id'] == q_id), None)
        if not q_obj:
            return
        
        # Lấy số thứ tự hiện tại của câu hỏi trong danh sách Treeview
        idx = self.tree_q.index(sel[0]) + 1
        self.question_editor_window(question=q_obj, q_index=idx)

    def delete_question(self):
        sel = self.tree_q.selection()
        if not sel:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn câu hỏi cần xóa!")
            return
        if not messagebox.askyesno("Xác nhận", "Bạn có chắc chắn muốn xóa câu hỏi này?"):
            return
        try:
            self.client.delete_question(int(sel[0]))
            self.load_questions()
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể xóa câu hỏi: {e}")

    def question_editor_window(self, question=None, q_index=None):
        d = tk.Toplevel(self.root)
        
        # Tiêu đề có kèm số câu
        title_str = f"Chỉnh Sửa Câu Hỏi (Câu {q_index})" if question else f"Thêm Câu Hỏi Mới (Câu {q_index})"
        d.title(title_str)
        d.geometry("700x750") # Thu nhỏ tỷ lệ cửa sổ tổng thể
        d.configure(bg=BG_CARD)
        d.transient(self.root)
        d.grab_set()

        scroll_c = tk.Canvas(d, bg=BG_CARD, bd=0, highlightthickness=0)
        scroll_c.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scrollbar = ttk.Scrollbar(d, orient="vertical", command=scroll_c.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        scroll_c.configure(yscrollcommand=scrollbar.set)

        # Giảm padding để tỷ lệ thon gọn hơn
        form = tk.Frame(scroll_c, bg=BG_CARD, padx=20, pady=10)
        
        # Ép width cố định để tránh frame tự phình to che mất scrollbar
        scroll_c.create_window((0, 0), window=form, anchor=tk.NW, width=660)
        form.bind("<Configure>", lambda e: scroll_c.configure(scrollregion=scroll_c.bbox("all")))

        # --- SỰ KIỆN LĂN CHUỘT (MOUSE WHEEL) ---
        def _on_mousewheel(event):
            scroll_c.yview_scroll(int(-1*(event.delta/120)), "units")
        
        def _bind_to_mousewheel(event):
            d.bind_all("<MouseWheel>", _on_mousewheel)
            
        def _unbind_from_mousewheel(event):
            d.unbind_all("<MouseWheel>")
            
        # Chỉ kích hoạt lăn chuột khi trỏ chuột đang ở trong cửa sổ Dialog này
        d.bind("<Enter>", _bind_to_mousewheel)
        d.bind("<Leave>", _unbind_from_mousewheel)
        
        # Dọn dẹp event khi bấm dấu X tắt cửa sổ
        def on_closing():
            d.unbind_all("<MouseWheel>")
            d.destroy()
        d.protocol("WM_DELETE_WINDOW", on_closing)

        # --- QUẢN LÝ TRẠNG THÁI HÌNH ẢNH ---
        self.current_img_state = {
            "question": question.get('imageUrl', None) if question else None,
            "explanation": question.get('explanationImage', None) if question else None
        }

        def create_image_uploader(parent, label_text, target_key):
            frame = tk.Frame(parent, bg=BG_CARD)
            frame.pack(fill=tk.X, pady=(10, 5))
            
            tk.Label(frame, text=label_text, bg=BG_CARD, fg=FG_GRAY, font=("Segoe UI", 9)).pack(anchor=tk.W, pady=(0, 2))
            
            # Thu nhỏ kích thước khung ảnh (380x160 thay vì 450x200)
            cw, ch = 380, 160 
            c = tk.Canvas(frame, width=cw, height=ch, bg=BG_CARD, highlightthickness=0, cursor="hand2")
            c.pack(anchor=tk.W)
            
            c.photo = None
            c.btn_window = None

            def draw_empty_state():
                c.delete("all")
                c.config(cursor="hand2")
                c.create_rectangle(2, 2, cw-2, ch-2, dash=(5, 5), outline=BORDER_COLOR, width=2)
                c.create_text(cw/2, ch/2 - 10, text="🖼️", font=("Segoe UI", 16))
                c.create_text(cw/2, ch/2 + 20, text="Nhấp để chọn ảnh", fill=FG_GRAY, font=("Segoe UI", 9))
                c.bind("<Button-1>", lambda e: choose_image())

            def draw_image_state(img):
                c.delete("all")
                c.unbind("<Button-1>")
                c.config(cursor="arrow")
                
                c.create_rectangle(1, 1, cw-1, ch-1, outline=BORDER_COLOR, width=1)
                img.thumbnail((cw - 10, ch - 10))
                c.photo = ImageTk.PhotoImage(img)
                c.create_image(cw/2, ch/2, image=c.photo, anchor=tk.CENTER)
                
                btn_x = tk.Button(c, text="✕", bg="#666666", fg="white", activebackground=BTN_DANGER, activeforeground="white",
                                  relief=tk.FLAT, font=("Segoe UI", 8, "bold"), command=remove_image, cursor="hand2", padx=5, pady=1)
                c.btn_window = c.create_window(cw - 15, 15, window=btn_x)

            def choose_image():
                filepath = filedialog.askopenfilename(title="Chọn ảnh", filetypes=[("Image files", "*.png *.jpg *.jpeg *.bmp *.webp")])
                if not filepath: return
                try:
                    img = Image.open(filepath)
                    draw_image_state(img.copy())
                    
                    buffered = io.BytesIO()
                    img_to_save = Image.open(filepath)
                    img_to_save.thumbnail((1024, 1024))
                    img_to_save.save(buffered, format="PNG")
                    b64_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
                    self.current_img_state[target_key] = f"data:image/png;base64,{b64_str}"
                except Exception as e:
                    messagebox.showerror("Lỗi", f"Không thể tải ảnh: {e}")

            def remove_image():
                self.current_img_state[target_key] = None
                draw_empty_state()

            existing_img = self.current_img_state[target_key]
            if existing_img and existing_img.startswith("data:image"):
                try:
                    b64_data = existing_img.split(",")[1] if "," in existing_img else existing_img
                    img_data = base64.b64decode(b64_data)
                    img = Image.open(io.BytesIO(img_data))
                    draw_image_state(img)
                except:
                    draw_empty_state()
            elif existing_img:
                draw_empty_state()
                c.delete("all")
                c.create_rectangle(1, 1, cw-1, ch-1, outline=BORDER_COLOR, width=1)
                c.create_text(cw/2, ch/2, text="[Ảnh đang lưu trên Server]", fill=FG_GRAY)
                btn_x = tk.Button(c, text="✕", bg="#666666", fg="white", relief=tk.FLAT, font=("Segoe UI", 8, "bold"), command=remove_image)
                c.create_window(cw - 15, 15, window=btn_x)
            else:
                draw_empty_state()

        # --- NỘI DUNG CÂU HỎI ---
        # Tích hợp hiển thị "Câu 1:", "Câu 2:"
        lbl_q_text = f"Câu {q_index}: Nội dung câu hỏi" if q_index else "Nội dung câu hỏi"
        tk.Label(form, text=lbl_q_text, bg=BG_CARD, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=(0, 2))
        
        # Giảm chiều cao Text area
        txt_content = tk.Text(form, height=3, bg=BG_DARK, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.SOLID, borderwidth=1, font=("Segoe UI", 9))
        if question:
            txt_content.insert("1.0", clean_html_explanation(question.get('content', '')))
        txt_content.pack(fill=tk.X, pady=2)

        create_image_uploader(form, "Hình ảnh câu hỏi (Tùy chọn)", "question")

        # --- KHU VỰC ĐÁP ÁN (DYNAMIC ROWS) ---
        ans_container = tk.Frame(form, bg=BG_CARD)
        ans_container.pack(fill=tk.X, pady=(15, 5))
        
        header_f = tk.Frame(ans_container, bg=BG_CARD)
        header_f.pack(fill=tk.X)
        tk.Label(header_f, text="Danh sách đáp án", bg=BG_CARD, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(side=tk.LEFT)
        
        rows_f = tk.Frame(ans_container, bg=BG_CARD)
        rows_f.pack(fill=tk.X, pady=5)
        
        answers_widgets = []

        def add_answer_row(ans_data=None):
            row_f = tk.Frame(rows_f, bg=BG_CARD)
            row_f.pack(fill=tk.X, pady=3)
            
            idx_lbl = tk.Label(row_f, text="", bg=BG_CARD, fg=FG_TEXT, font=("Segoe UI", 9, "bold"), width=3, anchor=tk.W)
            idx_lbl.pack(side=tk.LEFT)
            
            c_val = tk.BooleanVar(value=ans_data.get('isCorrect', False) if ans_data else False)
            tk.Checkbutton(row_f, variable=c_val, bg=BG_CARD, selectcolor=BG_DARK).pack(side=tk.LEFT, padx=(0, 5))
            
            # Giảm ipady (độ phình của ô nhập)
            ent = tk.Entry(row_f, bg=BG_DARK, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.SOLID, borderwidth=1, font=("Segoe UI", 9))
            ent.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4)
            if ans_data:
                ent.insert(0, ans_data.get('content', ''))
                
            def delete_self():
                row_f.destroy()
                answers_widgets.remove(row_data)
                update_row_labels()
                
            btn_del = tk.Button(row_f, text="🗑", bg=BG_CARD, fg=FG_GRAY, activeforeground=BTN_DANGER, relief=tk.FLAT, font=("Segoe UI", 11), cursor="hand2", command=delete_self)
            btn_del.pack(side=tk.LEFT, padx=(5, 0))
            
            row_data = {"frame": row_f, "lbl": idx_lbl, "c_val": c_val, "ent": ent}
            answers_widgets.append(row_data)
            update_row_labels()

        def update_row_labels():
            for i, r in enumerate(answers_widgets):
                r["lbl"].config(text=f"{chr(65+i)}.")

        tk.Button(header_f, text="+ Thêm dòng", bg=BG_CARD, fg=FG_TEXT, relief=tk.SOLID, borderwidth=1, font=("Segoe UI", 8), cursor="hand2", padx=8, command=lambda: add_answer_row()).pack(side=tk.RIGHT)

        if question and question.get('answersList'):
            for a in question['answersList']:
                add_answer_row(a)
        else:
            for _ in range(4): add_answer_row()

        # --- GIẢI THÍCH CHI TIẾT ---
        tk.Label(form, text="Giải thích chi tiết (Tùy chọn)", bg=BG_CARD, fg=FG_TEXT, font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=(10, 2))
        
        # Giảm chiều cao Text area
        txt_expl = tk.Text(form, height=4, bg=BG_DARK, fg=FG_TEXT, insertbackground=FG_TEXT, relief=tk.SOLID, borderwidth=1, font=("Segoe UI", 9))
        if question:
            cleaned_expl = clean_html_explanation(question.get('explanation', ''))
            txt_expl.insert("1.0", cleaned_expl)
        txt_expl.pack(fill=tk.X, pady=2)

        create_image_uploader(form, "Hình ảnh giải thích (Tùy chọn)", "explanation")

        # --- NÚT HÀNH ĐỘNG ---
        btn_frame = tk.Frame(form, bg=BG_CARD)
        btn_frame.pack(fill=tk.X, pady=(15, 20)) # Đẩy margin dưới lên một chút để tránh dính lề

        def save():
            content = clean_html_explanation(txt_content.get("1.0", tk.END).strip())
            explanation = txt_expl.get("1.0", tk.END).strip()
            
            if not content:
                messagebox.showerror("Lỗi", "Vui lòng nhập nội dung câu hỏi!")
                return
            
            answers_list = []
            for idx, r_data in enumerate(answers_widgets):
                ans_text = r_data["ent"].get().strip()
                if ans_text:
                    answers_list.append({
                        "id": 0,
                        "content": ans_text,
                        "isCorrect": r_data["c_val"].get(),
                        "indexOrder": idx,
                        "questionTargetId": question.get('id', 0) if question else 0
                    })
            
            if len(answers_list) < 2:
                messagebox.showerror("Lỗi", "Phải nhập ít nhất 2 đáp án!")
                return
            if not any(a['isCorrect'] for a in answers_list):
                messagebox.showerror("Lỗi", "Phải chọn ít nhất 1 đáp án đúng!")
                return

            payload = {
                "content": content,
                "explanation": explanation,
                "imageUrl": self.current_img_state["question"],
                "explanationImage": self.current_img_state["explanation"],
                "quizTargetId": self.selected_quiz_id,
                "answersList": answers_list
            }
            if question:
                payload["id"] = question["id"]
                
            try:
                self.client.save_question(payload)
                on_closing() # Đóng form và gỡ sự kiện chuột
                self.load_questions()
            except Exception as e:
                messagebox.showerror("Lỗi", f"Không thể lưu câu hỏi: {e}")

        tk.Button(btn_frame, text="Lưu lại", bg=BTN_PRIMARY, fg=FG_WHITE, activebackground="#0369A1", activeforeground="white", relief=tk.FLAT, font=("Segoe UI", 9, "bold"), cursor="hand2", command=save, padx=20, pady=6).pack(side=tk.RIGHT, padx=(10, 0))
        tk.Button(btn_frame, text="Hủy", bg=BG_CARD, fg=FG_TEXT, activebackground=BG_DARK, relief=tk.SOLID, borderwidth=1, font=("Segoe UI", 9), cursor="hand2", command=on_closing, padx=20, pady=6).pack(side=tk.RIGHT)

    # --- CLIPBOARD AI WORKFLOW ---

    def toggle_clipboard_monitor(self):
        if not self.client:
            messagebox.showwarning("Lỗi kết nối", "Vui lòng kết nối đến server trước!")
            return
        if not self.selected_quiz_id:
            messagebox.showwarning("Chưa chọn bộ đề", "Vui lòng chọn Bộ đề ở Tab Thư viện trước khi bắt đầu monitor!")
            return
            
        if self.clipboard_running:
            self.clipboard_running = False
            self.btn_toggle_clip.config(text="BẬT CLIPBOARD MONITOR", bg=BTN_PRIMARY)
            self.log_clip("🔴 Đã DỪNG theo dõi clipboard.")
        else:
            self.clipboard_running = True
            self.btn_toggle_clip.config(text="DỪNG CLIPBOARD MONITOR", bg=BTN_DANGER)
            self.log_clip("🟢 Đang THEO DÕI clipboard... Chụp ảnh bằng Win+Shift+S để import.")
            
            # Start background thread
            threading.Thread(target=self.clipboard_thread, daemon=True).start()

    def clipboard_thread(self):
        self.last_img_bytes = None
        while self.clipboard_running:
            try:
                img = ImageGrab.grabclipboard()
                if isinstance(img, Image.Image):
                    buffered = io.BytesIO()
                    img.save(buffered, format="PNG")
                    img_bytes = buffered.getvalue()
                    
                    if self.last_img_bytes is None or img_bytes[:100] != self.last_img_bytes[:100]:
                        self.last_img_bytes = img_bytes
                        self.root.after(0, lambda: self.log_clip("📸 Phát hiện ảnh mới trong clipboard! Đang gửi AI phân tích..."))
                        self.process_clipboard_image(img)
                else:
                    self.last_img_bytes = None
            except Exception as e:
                self.root.after(0, lambda: self.log_clip(f"Lỗi: {e}"))
            time.sleep(1.0)

    def process_clipboard_image(self, img):
        model = self.cb_models.get()
        endpoint = self.ent_ai_endpoint.get().strip()
        key = self.ent_ai_key.get().strip()
        def task():
            try:
                result = self.client.analyze_image(img, model, custom_url=endpoint, custom_key=key)
                self.root.after(0, lambda: self.on_clipboard_ai_success(result))
            except Exception as e:
                self.root.after(0, lambda: self.log_clip(f"❌ Phân tích AI thất bại: {e}"))
        threading.Thread(target=task, daemon=True).start()

    def on_clipboard_ai_success(self, data):
        self.parsed_ai_data = data
        self.log_clip(f"✅ AI phân tích thành công: {data['question'][:40]}...")
        
        # Populate GUI preview
        self.txt_clip_q.delete("1.0", tk.END)
        self.txt_clip_q.insert("1.0", clean_html_explanation(data.get('question', '')))
        
        # Load answers
        for idx, (c_val, ent) in enumerate(self.clip_answers):
            ent.delete(0, tk.END)
            c_val.set(False)
            if len(data.get('answers', [])) > idx:
                ans_data = data['answers'][idx]
                ent.insert(0, ans_data.get('content', ''))
                c_val.set(ans_data.get('isCorrect', False))
                
        # Clean up explanation returned by AI before displaying it
        cleaned_expl = clean_html_explanation(data.get('explanation', ''))
        self.txt_clip_expl.delete("1.0", tk.END)
        self.txt_clip_expl.insert("1.0", cleaned_expl)
        
        # Check if auto save is enabled
        if self.val_auto_save.get():
            self.log_clip("⚙️ Đang tự động lưu vào database...")
            self.save_clip_preview(silent=True)
        else:
            self.btn_save_clip_preview.config(state=tk.NORMAL)
            self.log_clip("🔔 Chờ bạn xác nhận / chỉnh sửa để lưu.")

    def save_clip_preview(self, silent=False):
        if not self.client or not self.selected_quiz_id:
            return

        content = clean_html_explanation(self.txt_clip_q.get("1.0", tk.END).strip())
        explanation = self.txt_clip_expl.get("1.0", tk.END).strip()
        
        if not content:
            if not silent:
                messagebox.showerror("Lỗi", "Nội dung câu hỏi rỗng!")
            return

        answers_list = []
        for idx, (c_val, ent) in enumerate(self.clip_answers):
            ans_text = ent.get().strip()
            if ans_text:
                answers_list.append({
                    "id": 0,
                    "content": ans_text,
                    "isCorrect": c_val.get(),
                    "indexOrder": idx,
                    "questionTargetId": 0
                })
        
        # Standardize answers to 4
        while len(answers_list) < 4:
            answers_list.append({
                "id": 0,
                "content": "",
                "isCorrect": False,
                "indexOrder": len(answers_list),
                "questionTargetId": 0
            })

        payload = {
            "content": content,
            "explanation": explanation,
            "imageUrl": None,
            "explanationImage": None,
            "quizTargetId": self.selected_quiz_id,
            "answersList": answers_list
        }

        def save():
            try:
                res = self.client.save_question(payload)
                self.root.after(0, lambda: self.on_question_saved_success(res, silent))
            except Exception as e:
                self.root.after(0, lambda: self.log_clip(f"❌ Lưu câu hỏi thất bại: {e}"))
                
        threading.Thread(target=save, daemon=True).start()

    def on_question_saved_success(self, res, silent):
        self.log_clip(f"🎉 Đã lưu câu hỏi thành công! ID: {res.get('id')}")
        self.btn_save_clip_preview.config(state=tk.DISABLED)
        self.load_questions()
        if not silent:
            messagebox.showinfo("Thành Công", "Đã lưu câu hỏi thành công!")

    # --- BULK IMPORT ---

    def select_bulk_folder(self):
        folder = filedialog.askdirectory(title="Chọn thư mục chứa ảnh đề thi")
        if not folder:
            return
            
        self.bulk_folder = folder
        self.log_bulk(f"📂 Đã chọn thư mục: {folder}")
        
        valid_exts = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
        self.bulk_files = [f for f in os.listdir(folder) if f.lower().endswith(valid_exts)]
        
        for item in self.tree_bulk_files.get_children():
            self.tree_bulk_files.delete(item)
            
        for f in self.bulk_files:
            self.tree_bulk_files.insert("", tk.END, values=(f, "Chờ xử lý"))
            
        self.lbl_bulk_status.config(text=f"Số lượng ảnh: 0/{len(self.bulk_files)}")
        self.progress_var.set(0)
        
        if self.bulk_files and self.selected_quiz_id:
            self.btn_start_bulk.config(state=tk.NORMAL)
        else:
            self.btn_start_bulk.config(state=tk.DISABLED)

    def start_bulk_import(self):
        if not self.client or not self.selected_quiz_id or not self.bulk_files:
            return
            
        self.btn_start_bulk.config(state=tk.DISABLED)
        self.log_bulk("🚀 Bắt đầu quá trình import hàng loạt...")
        
        def run_bulk():
            total = len(self.bulk_files)
            model = self.cb_models.get()
            endpoint = self.ent_ai_endpoint.get().strip()
            key = self.ent_ai_key.get().strip()
            
            for idx, filename in enumerate(self.bulk_files):
                self.root.after(0, lambda i=idx: self.update_bulk_file_status(i, "Đang xử lý"))
                path = os.path.join(self.bulk_folder, filename)
                self.root.after(0, lambda f=filename: self.log_bulk(f"🔄 Đang xử lý file: {f}"))
                
                try:
                    img = Image.open(path)
                    q_data = self.client.analyze_image(img, model, custom_url=endpoint, custom_key=key)
                    
                    answers_list = []
                    for aidx, ans in enumerate(q_data['answers']):
                        answers_list.append({
                            "id": 0,
                            "content": ans['content'],
                            "isCorrect": ans['isCorrect'],
                            "indexOrder": aidx,
                            "questionTargetId": 0
                        })
                    while len(answers_list) < 4:
                        answers_list.append({
                            "id": 0,
                            "content": "",
                            "isCorrect": False,
                            "indexOrder": len(answers_list),
                            "questionTargetId": 0
                        })
                        
                    payload = {
                        "content": clean_html_explanation(q_data['question']),
                        "explanation": clean_html_explanation(q_data['explanation']),
                        "imageUrl": None,
                        "explanationImage": None,
                        "quizTargetId": self.selected_quiz_id,
                        "answersList": answers_list
                    }
                    self.client.save_question(payload)
                    
                    self.root.after(0, lambda i=idx: self.update_bulk_file_status(i, "Thành công"))
                    self.root.after(0, lambda f=filename: self.log_bulk(f"✅ Import thành công: {f}"))
                except Exception as e:
                    self.root.after(0, lambda i=idx: self.update_bulk_file_status(i, "Thất bại"))
                    self.root.after(0, lambda f=filename, err=e: self.log_bulk(f"❌ Thất bại {f}: {err}"))
                    
                prog_pct = ((idx + 1) / total) * 100
                self.root.after(0, lambda p=prog_pct, i=idx+1, t=total: self.update_bulk_progress(p, i, t))
                time.sleep(2.0)
                
            self.root.after(0, lambda: self.log_bulk("🏁 Hoàn tất quá trình import hàng loạt!"))
            self.root.after(0, self.load_questions)
            
        threading.Thread(target=run_bulk, daemon=True).start()

    def update_bulk_file_status(self, idx, status):
        children = self.tree_bulk_files.get_children()
        if len(children) > idx:
            item = children[idx]
            filename = self.tree_bulk_files.item(item, 'values')[0]
            self.tree_bulk_files.item(item, values=(filename, status))

    def update_bulk_progress(self, pct, current, total):
        self.progress_var.set(pct)
        self.lbl_bulk_status.config(text=f"Số lượng ảnh: {current}/{total}")


if __name__ == "__main__":
    root = tk.Tk()
    app = QuizManagerApp(root)
    root.mainloop()
