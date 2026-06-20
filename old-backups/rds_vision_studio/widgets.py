import tkinter as tk
from tkinter import ttk
from tkinter import messagebox
from tkinter import filedialog
import re
import csv
import datetime
import threading
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional, Callable
import theme

class ConsoleLogger(ttk.Frame):
    """A clean system console to log operations, queries, metrics, and errors."""
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        
        # Heading Frame
        header = ttk.Frame(self)
        header.pack(fill="x", padx=5, pady=2)
        
        ttk.Label(header, text="SYSTEM DIAGNOSTICS & METRICS CONSOLE", font=theme.FONT_BOLD).pack(side="left")
        
        ttk.Button(header, text="Clear Console", command=self.clear, style="TButton").pack(side="right")
        
        # Logger Text widget
        text_frame = ttk.Frame(self)
        text_frame.pack(fill="both", expand=True, padx=5, pady=2)
        
        self.text = tk.Text(
            text_frame,
            bg="#181818", # extra dark contrast
            fg=theme.COLOR_TEXT,
            font=theme.FONT_CODE,
            insertbackground=theme.COLOR_TEXT_BRIGHT,
            relief="flat",
            wrap="word",
            state="disabled",
            height=6
        )
        self.text.pack(side="left", fill="both", expand=True)
        
        scroll = ttk.Scrollbar(text_frame, orient="vertical", command=self.text.yview)
        scroll.pack(side="right", fill="y")
        self.text.configure(yscrollcommand=scroll.set)
        
        # Tags for colored outputs
        self.text.tag_configure("info", foreground=theme.COLOR_TEXT)
        self.text.tag_configure("success", foreground=theme.COLOR_SUCCESS)
        self.text.tag_configure("error", foreground=theme.COLOR_ERROR)
        self.text.tag_configure("query", foreground=theme.COLOR_ACCENT_HOVER)
        self.text.tag_configure("system", foreground=theme.COLOR_TEXT_MUTED)

        self.info("System Initialized. Awaiting database connection...")

    def log(self, message: str, tag: str = "info"):
        self.text.configure(state="normal")
        timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        prefix = f"[{timestamp}] "
        self.text.insert("end", prefix, "system")
        self.text.insert("end", f"{message}\n", tag)
        self.text.configure(state="disabled")
        self.text.see("end")

    def info(self, message: str):
        self.log(message, "info")

    def success(self, message: str):
        self.log(message, "success")

    def error(self, message: str):
        self.log(message, "error")

    def query(self, query_str: str, duration: float):
        self.log(f"SQL Execute ({duration * 1000:.1f}ms): {query_str.strip()}", "query")

    def clear(self):
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.configure(state="disabled")


class LineNumberedText(ttk.Frame):
    """A standard Text widget equipped with a synchronized line numbers panel."""
    def __init__(self, parent, **kwargs):
        super().__init__(parent)
        
        # Line numbers canvas
        self.line_canvas = tk.Canvas(
            self,
            width=35,
            bg=theme.COLOR_SIDEBAR,
            highlightthickness=0,
            bd=0
        )
        self.line_canvas.pack(side="left", fill="y")
        
        # Main text editing widget
        self.text = tk.Text(
            self,
            bg=theme.COLOR_CONTAINER,
            fg=theme.COLOR_TEXT_BRIGHT,
            insertbackground=theme.COLOR_TEXT_BRIGHT,
            relief="flat",
            wrap="none",
            undo=True,
            font=theme.FONT_CODE,
            **kwargs
        )
        self.text.pack(side="left", fill="both", expand=True)
        
        # Scrollbars
        self.scroll_y = ttk.Scrollbar(self, orient="vertical", command=self.yview_sync)
        self.scroll_y.pack(side="right", fill="y")
        
        self.text.configure(yscrollcommand=self.scroll_sync)
        
        # Set up events for synchronization
        self.text.bind("<KeyRelease>", self.redraw)
        self.text.bind("<Configure>", self.redraw)
        
        # Tab replacement (4 spaces)
        self.text.bind("<Tab>", self.insert_tab)
        
        self.redraw()

    def insert_tab(self, event):
        self.text.insert("insert", "    ")
        return "break"

    def yview_sync(self, *args):
        self.text.yview(*args)

    def scroll_sync(self, *args):
        self.scroll_y.set(*args)
        self.redraw()

    def redraw(self, event=None):
        self.line_canvas.delete("all")
        
        i = self.text.index("@0,0")
        while True :
            dline = self.text.dlineinfo(i)
            if dline is None: 
                break
            y = dline[1]
            linenum = str(i).split(".")[0]
            self.line_canvas.create_text(
                30, 
                y + 3, 
                anchor="ne", 
                text=linenum, 
                font=theme.FONT_CODE, 
                fill=theme.COLOR_TEXT_MUTED
            )
            i = self.text.index(f"{i}+1line")


class SqlEditor(ttk.Frame):
    """An advanced query formulation studio with SQL coloring and timing metrics."""
    def __init__(self, parent, run_callback: Callable[[str], None], logger: ConsoleLogger, db_manager=None, run_async_callback=None, **kwargs):
        super().__init__(parent, **kwargs)
        self.run_callback = run_callback
        self.logger = logger
        self.db = db_manager
        self.run_async = run_async_callback
        self.query_history: List[str] = []

        # Action bar
        actions = ttk.Frame(self)
        actions.pack(fill="x", padx=5, pady=4)
        
        ttk.Label(actions, text="SQL SCRIPT COMPILER", font=theme.FONT_BOLD).pack(side="left")
        
        self.run_btn = ttk.Button(actions, text="⚡ Run Query (F5)", command=self.trigger_run, style="Accent.TButton")
        self.run_btn.pack(side="right", padx=2)
        
        self.explain_btn = ttk.Button(actions, text="🔍 Explain Plan", command=self.trigger_explain)
        self.explain_btn.pack(side="right", padx=2)
        
        ttk.Button(actions, text="Clear", command=self.clear_editor).pack(side="right", padx=2)
        
        ttk.Label(actions, text="History:", font=theme.FONT_BODY).pack(side="right", padx=5)
        self.history_combo = ttk.Combobox(actions, state="readonly", width=30)
        self.history_combo.pack(side="right", padx=2)
        self.history_combo.bind("<<ComboboxSelected>>", self.load_history)
        
        # Editor
        # Status Bar at the bottom
        self.status_bar = ttk.Frame(self)
        self.status_bar.pack(fill="x", side="bottom", padx=5, pady=(2, 4))
        
        self.status_lbl = ttk.Label(self.status_bar, text="✓ Empty script", style="TLabel")
        self.status_lbl.pack(side="left")

        # Editor
        self.editor = LineNumberedText(self)
        self.editor.pack(fill="both", expand=True, side="top", padx=5, pady=2)
        self.editor.text.bind("<F5>", lambda e: self.trigger_run())
        self.editor.text.bind("<KeyRelease>", self.on_text_change, add="+")
        
        # Define syntax tags
        self.keywords = [
            "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "ON", 
            "GROUP", "BY", "ORDER", "LIMIT", "OFFSET", "INSERT", "INTO", "VALUES", 
            "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP", "INDEX", "PRAGMA",
            "AND", "OR", "IN", "AS", "HAVING", "COUNT", "SUM", "AVG", "MIN", "MAX",
            "NULL", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "INTEGER", "TEXT",
            "REAL", "BLOB", "NOT", "DEFAULT", "UNIQUE", "CHECK"
        ]
        
        # Colors
        self.editor.text.tag_configure("keyword", foreground="#569cd6", font=theme.FONT_CODE) # VS Code light-blue
        self.editor.text.tag_configure("string", foreground="#ce9178", font=theme.FONT_CODE) # VS Code peach-red
        self.editor.text.tag_configure("comment", foreground="#6a9955", font=theme.FONT_CODE) # green comments
        self.editor.text.tag_configure("number", foreground="#b5cea8", font=theme.FONT_CODE) # pale green numbers
        self.editor.text.tag_configure("error_squiggle", foreground="#f48771", underline=True)

    def load_history(self, event=None):
        idx = self.history_combo.current()
        if idx >= 0 and idx < len(self.query_history):
            self.set_query(self.query_history[idx])

    def add_to_history(self, query: str):
        q = query.strip()
        if not q:
            return
        if q in self.query_history:
            self.query_history.remove(q)
        self.query_history.insert(0, q)
        # Limit to last 20
        self.query_history = self.query_history[:20]
        # Summarize for combo preview
        preview_list = [((item[:30] + "...") if len(item) > 30 else item).replace('\n', ' ') for item in self.query_history]
        self.history_combo["values"] = preview_list
        if preview_list:
            self.history_combo.current(0)

    def set_query(self, query: str):
        self.editor.text.delete("1.0", "end")
        self.editor.text.insert("1.0", query)
        self.highlight_syntax()

    def get_query(self) -> str:
        return self.editor.text.get("1.0", "end-1c")

    def trigger_run(self):
        query = self.get_query()
        if not query.strip():
            messagebox.showwarning("Warning", "SQL editor is empty.")
            return
        self.add_to_history(query)
        self.run_callback(query)

    def trigger_explain(self):
        query = self.get_query()
        if not query.strip():
            messagebox.showwarning("Warning", "SQL editor is empty.")
            return
        if not self.db or not self.db.is_connected():
            messagebox.showwarning("No Database", "Connect to a database before explaining SQL.")
            return
        QueryPlanViewer(self, self.db, self.run_async, self.logger, query)

    def clear_editor(self):
        self.editor.text.delete("1.0", "end")
        self.editor.redraw()

    def on_text_change(self, event=None):
        self.highlight_syntax()
        self.editor.redraw()
        
        # Debounce the SQL linter (300 ms delay)
        if hasattr(self, "_lint_timer") and self._lint_timer:
            self.after_cancel(self._lint_timer)
        self._lint_timer = self.after(300, self.lint_sql)

    def lint_sql(self):
        self._lint_timer = None
        if not self.db or not self.db.is_connected():
            self.status_lbl.configure(text="✓ Connected to no database (cannot lint)", style="TLabel")
            self._clear_errors()
            return
            
        query = self.get_query().strip()
        if not query:
            self.status_lbl.configure(text="✓ Empty script", style="TLabel")
            self._clear_errors()
            return
            
        is_ok, err_msg = self.db.validate_query_syntax(query)
        if is_ok:
            self.status_lbl.configure(text="✓ SQL syntax OK", style="Success.TLabel")
            self._clear_errors()
        else:
            if "explain cannot explain" in err_msg.lower() or "cannot explain" in err_msg.lower():
                self.status_lbl.configure(text="✓ SQL syntax OK (DDL)", style="Success.TLabel")
                self._clear_errors()
            else:
                self.status_lbl.configure(text=f"❌ {err_msg}", style="Error.TLabel")
                self._highlight_error(query, err_msg)

    def _clear_errors(self):
        self.editor.text.tag_remove("error_squiggle", "1.0", "end")

    def _highlight_error(self, query_text, error_message):
        self._clear_errors()
        target_word = None
        
        # Match near "something"
        match_near = re.search(r'near "([^"]+)"', error_message)
        if match_near:
            target_word = match_near.group(1)
        else:
            # Match no such column: name
            match_col = re.search(r'no such column: ([a-zA-Z0-9_"\.]+)', error_message)
            if match_col:
                target_word = match_col.group(1).replace('"', '')
            else:
                # Match no such table: name
                match_tbl = re.search(r'no such table: ([a-zA-Z0-9_"\.]+)', error_message)
                if match_tbl:
                    target_word = match_tbl.group(1).replace('"', '')
                    
        if target_word:
            start_idx = "1.0"
            while True:
                pos = self.editor.text.search(target_word, start_idx, stopindex="end", nocase=True)
                if not pos:
                    break
                end_pos = f"{pos} + {len(target_word)} chars"
                self.editor.text.tag_add("error_squiggle", pos, end_pos)
                start_idx = end_pos

    def highlight_syntax(self):
        """Simple and efficient regex syntax highlighting for SQL code."""
        text_widget = self.editor.text
        content = text_widget.get("1.0", "end")
        
        # Clear tags
        for tag in ["keyword", "string", "comment", "number"]:
            text_widget.tag_remove(tag, "1.0", "end")
            
        # 1. Match Comments (starting with -- or /* */)
        for match in re.finditer(r"--[^\n]*", content):
            start = f"1.0 + {match.start()} chars"
            end = f"1.0 + {match.end()} chars"
            text_widget.tag_add("comment", start, end)

        # 2. Match Strings ('strings' or "strings")
        for match in re.finditer(r"'[^']*'|\"[^\"]*\"", content):
            start = f"1.0 + {match.start()} chars"
            end = f"1.0 + {match.end()} chars"
            text_widget.tag_add("string", start, end)

        # 3. Match Keywords (case insensitive boundaries)
        for keyword in self.keywords:
            pattern = r"\b" + re.escape(keyword) + r"\b"
            for match in re.finditer(pattern, content, flags=re.IGNORECASE):
                # Ensure it's not inside a comment or string
                idx = match.start()
                tags = text_widget.tag_names(f"1.0 + {idx} chars")
                if "comment" not in tags and "string" not in tags:
                    start = f"1.0 + {match.start()} chars"
                    end = f"1.0 + {match.end()} chars"
                    text_widget.tag_add("keyword", start, end)

        # 4. Match Numbers
        for match in re.finditer(r"\b\d+\b", content):
            idx = match.start()
            tags = text_widget.tag_names(f"1.0 + {idx} chars")
            if "comment" not in tags and "string" not in tags and "keyword" not in tags:
                start = f"1.0 + {match.start()} chars"
                end = f"1.0 + {match.end()} chars"
                text_widget.tag_add("number", start, end)


class PagedDataGridViewer(ttk.Frame):
    """
    A grid visualizer panel featuring search indexing, custom column resizing,
    asynchronous header sorting, pagination mechanics, visual spreadsheet edits,
    and detail inspections.
    """
    def __init__(self, parent, data_fetch_callback: Callable[..., Tuple[List[str], List[List[Any]], int]], logger: ConsoleLogger, db_manager=None, run_async_callback=None, **kwargs):
        super().__init__(parent, **kwargs)
        self.data_fetch_callback = data_fetch_callback
        self.logger = logger
        self.db = db_manager
        self.run_async = run_async_callback
        
        # State indicators
        self.table_name: Optional[str] = None
        self.current_page = 1
        self.page_size = 100
        self.total_records = 0
        self.sort_column: Optional[str] = None
        self.sort_descending = False
        self.search_text = ""
        self.headers: List[str] = []
        self.rows: List[List[Any]] = []

        # Unsaved edits trackers
        self.dirty_rows = {} # row_idx -> {col_name: new_val}
        self.original_rows_snapshot = [] # Deep copy of rows on load

        # Build UI layout
        self.create_widgets()

    def create_widgets(self):
        # 1. Search / Action header panel
        self.control_bar = ttk.Frame(self)
        self.control_bar.pack(fill="x", padx=5, pady=4)

        ttk.Label(self.control_bar, text="Filter Records:", font=theme.FONT_BOLD).pack(side="left", padx=2)
        
        self.search_var = tk.StringVar()
        self.search_entry = ttk.Entry(self.control_bar, textvariable=self.search_var, width=30)
        self.search_entry.pack(side="left", padx=5)
        self.search_entry.bind("<Return>", lambda e: self.trigger_search())
        
        ttk.Button(self.control_bar, text="🔍 Filter", command=self.trigger_search).pack(side="left", padx=2)
        ttk.Button(self.control_bar, text="Reset", command=self.reset_search).pack(side="left", padx=2)
        
        # Row modifications (Add/Delete) - only active in table mode
        self.add_row_btn = ttk.Button(self.control_bar, text="➕ Add Row", command=self.add_row_record)
        self.add_row_btn.pack(side="left", padx=(15, 2))
        self.delete_row_btn = ttk.Button(self.control_bar, text="❌ Delete Row", command=self.delete_row_record)
        self.delete_row_btn.pack(side="left", padx=2)

        # Export Actions
        ttk.Button(self.control_bar, text="📥 Export CSV", command=self.export_csv).pack(side="right", padx=2)

        # 2. Main data Treeview with scrollbars
        self.grid_frame = ttk.Frame(self)
        self.grid_frame.pack(fill="both", expand=True, padx=5, pady=2)
        
        # Horizontal and Vertical Scrollbars
        self.scroll_y = ttk.Scrollbar(self.grid_frame, orient="vertical")
        self.scroll_y.pack(side="right", fill="y")
        
        self.scroll_x = ttk.Scrollbar(self.grid_frame, orient="horizontal")
        self.scroll_x.pack(side="bottom", fill="x")

        # Treeview
        self.tree = ttk.Treeview(
            self.grid_frame,
            selectmode="browse",
            yscrollcommand=self.scroll_y.set,
            xscrollcommand=self.scroll_x.set
        )
        self.tree.pack(side="left", fill="both", expand=True)
        
        self.scroll_y.configure(command=self.tree.yview)
        self.scroll_x.configure(command=self.tree.xview)
        
        # Double click to edit cell or inspect record
        self.tree.bind("<Double-1>", self.on_double_click)
        
        # Unsaved edits warning toolbar (initially hidden)
        self.edit_toolbar = ttk.Frame(self, style="Card.TFrame")
        
        lbl = ttk.Label(
            self.edit_toolbar, 
            text="⚠️ Unsaved modifications pending in table data.", 
            foreground=theme.COLOR_ERROR, 
            font=theme.FONT_BOLD
        )
        lbl.pack(side="left", padx=10, pady=5)
        
        ttk.Button(
            self.edit_toolbar, 
            text="Commit Changes", 
            command=self.commit_changes, 
            style="Accent.TButton"
        ).pack(side="right", padx=5)
        
        ttk.Button(
            self.edit_toolbar, 
            text="Revert Edits", 
            command=self.revert_edits, 
            style="TButton"
        ).pack(side="right", padx=5)

        # 3. Footer paging panel
        self.pager_frame = ttk.Frame(self)
        self.pager_frame.pack(fill="x", padx=5, pady=4)
        
        # Pagination Controls
        self.btn_first = ttk.Button(self.pager_frame, text="⏮", width=4, command=self.go_first)
        self.btn_first.pack(side="left", padx=2)
        
        self.btn_prev = ttk.Button(self.pager_frame, text="◀", width=4, command=self.go_prev)
        self.btn_prev.pack(side="left", padx=2)
        
        self.page_info_label = ttk.Label(self.pager_frame, text="Page 0 of 0", font=theme.FONT_BODY)
        self.page_info_label.pack(side="left", padx=10)
        
        self.btn_next = ttk.Button(self.pager_frame, text="▶", width=4, command=self.go_next)
        self.btn_next.pack(side="left", padx=2)
        
        self.btn_last = ttk.Button(self.pager_frame, text="⏭", width=4, command=self.go_last)
        self.btn_last.pack(side="left", padx=2)
        
        # Page size
        ttk.Label(self.pager_frame, text="Page Size:", font=theme.FONT_BODY).pack(side="left", padx=(20, 5))
        self.size_combo = ttk.Combobox(self.pager_frame, values=["50", "100", "250", "500"], width=6, state="readonly")
        self.size_combo.set(str(self.page_size))
        self.size_combo.pack(side="left", padx=2)
        self.size_combo.bind("<<ComboboxSelected>>", self.on_page_size_change)
        
        # Total counts label
        self.totals_label = ttk.Label(self.pager_frame, text="Showing 0 of 0 records", font=theme.FONT_BODY)
        self.totals_label.pack(side="right", padx=10)

    def clear_unsaved_edits(self):
        self.dirty_rows = {}
        if self.edit_toolbar:
            self.edit_toolbar.pack_forget()

    def show_edit_toolbar(self):
        if self.dirty_rows:
            self.pager_frame.pack_forget()
            self.edit_toolbar.pack(fill="x", padx=5, pady=2, side="bottom")
            self.pager_frame.pack(fill="x", padx=5, pady=4, side="bottom")

    def on_double_click(self, event):
        if not self.table_name or not self.db:
            # Fallback to inspecting record read-only
            self.inspect_record(event)
            return

        row_id = self.tree.identify_row(event.y)
        col_id = self.tree.identify_column(event.x)
        
        if not row_id or not col_id:
            return
            
        if col_id == "#0":
            return # Row index column is read-only
            
        col_idx = int(col_id.replace("#", "")) - 1
        row_idx = int(row_id)
        
        self.edit_cell(row_idx, col_idx)

    def edit_cell(self, row_idx, col_idx):
        col_name = self.headers[col_idx]
        current_val = self.rows[row_idx][col_idx]
        
        # Get bounding box relative to treeview
        bbox = self.tree.bbox(str(row_idx), f"#{col_idx + 1}")
        if not bbox:
            return
        x, y, w, h = bbox
        
        # Create temp entry widget placed precisely over the cell
        entry = ttk.Entry(self.tree)
        entry.insert(0, "" if current_val == "[NULL]" else current_val)
        entry.select_range(0, "end")
        entry.focus_set()
        entry.place(x=x, y=y, width=w, height=h)
        
        def save_edit(event=None):
            if not entry.winfo_exists():
                return
            new_val = entry.get()
            orig_val = self.original_rows_snapshot[row_idx][col_idx]
            
            # Match NULL values represented as string
            if new_val == "":
                new_val = "[NULL]"
                
            if str(new_val) != str(orig_val):
                if row_idx not in self.dirty_rows:
                    self.dirty_rows[row_idx] = {}
                self.dirty_rows[row_idx][col_name] = new_val
                
                # Update text in row grid
                self.rows[row_idx][col_idx] = new_val
                self.tree.item(str(row_idx), values=self.rows[row_idx])
                
                # Tag dirty rows
                current_tags = list(self.tree.item(str(row_idx), "tags") or [])
                if "dirty" not in current_tags:
                    current_tags.append("dirty")
                self.tree.item(str(row_idx), tags=current_tags)
                
                self.show_edit_toolbar()
            entry.destroy()
            
        def cancel_edit(event=None):
            if entry.winfo_exists():
                entry.destroy()
                
        entry.bind("<Return>", save_edit)
        entry.bind("<FocusOut>", save_edit)
        entry.bind("<Escape>", cancel_edit)

    def commit_changes(self):
        if not self.db or not self.table_name or not self.dirty_rows:
            return
            
        def save_process():
            for row_idx, changed_cols in self.dirty_rows.items():
                orig_vals = {}
                for c_idx, c_name in enumerate(self.headers):
                    orig_vals[c_name] = self.original_rows_snapshot[row_idx][c_idx]
                
                for col_name, new_val in changed_cols.items():
                    self.db.update_record_val(
                        self.table_name,
                        orig_vals,
                        col_name,
                        new_val
                    )

        def on_success(result):
            self.logger.success("Grid alterations successfully saved to database.")
            self.clear_unsaved_edits()
            self.refresh_grid()

        def on_error(err):
            self.logger.error(f"Failed to commit cell changes: {str(err)}")
            messagebox.showerror("Save Error", f"Unable to commit grid adjustments:\n{str(err)}")

        if self.run_async:
            self.run_async(save_process, (), on_success, on_error, "Saving table data changes...")
        else:
            try:
                save_process()
                on_success(None)
            except Exception as e:
                on_error(e)

    def revert_edits(self):
        self.rows = [list(r) for r in self.original_rows_snapshot]
        self.clear_unsaved_edits()
        self.render_tree()

    def add_row_record(self):
        if not self.db or not self.table_name:
            return
            
        def add_process():
            self.db.insert_empty_row(self.table_name)
            
        def on_success(result):
            self.logger.success("Successfully inserted new record.")
            self.refresh_grid()
            
        def on_error(err):
            self.logger.error(f"Failed to add row: {str(err)}")
            messagebox.showerror("Error", f"Failed to insert record:\n{str(err)}")
            
        if self.run_async:
            self.run_async(add_process, (), on_success, on_error, "Inserting new row...")
        else:
            try:
                add_process()
                on_success(None)
            except Exception as e:
                on_error(e)

    def delete_row_record(self):
        if not self.db or not self.table_name:
            return
            
        selection = self.tree.selection()
        if not selection:
            messagebox.showwarning("Selection Missing", "Please select a row in the grid to delete.")
            return
            
        row_idx = int(selection[0])
        
        if not messagebox.askyesno(
            "Confirm Delete", 
            f"Are you sure you want to permanently delete the selected row (Row {row_idx + 1})?"
        ):
            return
            
        # Get original values
        orig_vals = {}
        for c_idx, c_name in enumerate(self.headers):
            orig_vals[c_name] = self.original_rows_snapshot[row_idx][c_idx]
            
        def delete_process():
            self.db.delete_record(self.table_name, orig_vals)
            
        def on_success(result):
            self.logger.success("Deleted selected record from table.")
            self.refresh_grid()
            
        def on_error(err):
            self.logger.error(f"Failed to delete row: {str(err)}")
            messagebox.showerror("Error", f"Failed to delete record:\n{str(err)}")
            
        if self.run_async:
            self.run_async(delete_process, (), on_success, on_error, "Deleting record...")
        else:
            try:
                delete_process()
                on_success(None)
            except Exception as e:
                on_error(e)

    def load_table(self, table_name: str):
        """Set active table and reset paging settings."""
        self.table_name = table_name
        self.current_page = 1
        self.sort_column = None
        self.sort_descending = False
        self.search_var.set("")
        self.search_text = ""
        self.refresh_grid()

    def set_custom_results(self, headers: List[str], rows: List[List[Any]], status_msg: str):
        """Displays raw results directly without pagination (used for Custom SQL executions)."""
        self.table_name = None # Disable table mode
        self.headers = headers
        self.rows = rows
        self.total_records = len(rows)
        
        # Hide pager and search actions when viewing custom query results
        self.control_bar.pack_forget()
        self.pager_frame.pack_forget()
        
        # Redraw grid
        self.render_tree()
        self.logger.success(f"Grid populated with custom result set. {status_msg}")

    def enable_table_controls(self):
        """Restores page and filter bars for table-mode viewing."""
        self.control_bar.pack(fill="x", padx=5, pady=4)
        self.pager_frame.pack(fill="x", padx=5, pady=4)

    def refresh_grid(self):
        """Fetches paged data and renders the records in the Treeview."""
        if not self.table_name:
            return
        
        self.enable_table_controls()
        self.clear_unsaved_edits()
        
        # Calculate pagination offset
        offset = (self.current_page - 1) * self.page_size
        
        def fetch_data():
            return self.data_fetch_callback(
                self.table_name,
                self.page_size,
                offset,
                self.sort_column,
                self.sort_descending,
                self.search_text
            )

        def on_success(result):
            self.headers, self.rows, self.total_records = result
            # Cache a deep copy of loaded rows for comparison
            self.original_rows_snapshot = [list(r) for r in self.rows]
            self.render_tree()
            self.update_pager_controls()

        def on_error(err):
            self.logger.error(f"Error loading table '{self.table_name}': {str(err)}")
            messagebox.showerror("Error", f"Could not load data:\n{str(err)}")

        if self.run_async:
            self.run_async(fetch_data, (), on_success, on_error, f"Loading table '{self.table_name}'...")
        else:
            try:
                on_success(fetch_data())
            except Exception as e:
                on_error(e)

    def render_tree(self):
        """Cleans and populates the Treeview columns and row elements."""
        # 1. Clear current Treeview columns and items
        self.tree.delete(*self.tree.get_children())
        
        # Columns setup
        # Add special index/row numbering column as `#0`
        self.tree["columns"] = self.headers
        self.tree.column("#0", width=50, minwidth=40, stretch=False, anchor="center")
        self.tree.heading("#0", text="#")
        
        # Calculate maximum widths based on headers and sample rows to auto-scale columns
        max_col_widths = {col: max(len(str(col)), 8) for col in self.headers}
        for row in self.rows[:100]: # check first 100 rows for size estimation
            for i, val in enumerate(row):
                if i < len(self.headers):
                    col = self.headers[i]
                    max_col_widths[col] = max(max_col_widths[col], len(str(val)))

        for col in self.headers:
            width_px = min(max_col_widths[col] * 9, 350) # capping individual col width at 350px
            width_px = max(width_px, 80) # min width 80px
            
            # Setup sorting markers
            heading_text = col
            if col == self.sort_column:
                heading_text += "  ▼" if self.sort_descending else "  ▲"
                
            self.tree.column(col, width=width_px, minwidth=50, stretch=True, anchor="w")
            self.tree.heading(
                col, 
                text=heading_text, 
                command=lambda c=col: self.sort_by_column(c)
            )

        # 2. Populate rows
        offset = (self.current_page - 1) * self.page_size if self.table_name else 0
        for idx, row in enumerate(self.rows):
            row_num = offset + idx + 1
            # alternating row styles
            tag = "even" if idx % 2 == 0 else "odd"
            self.tree.insert("", "end", iid=str(idx), text=str(row_num), values=row, tags=(tag,))
            
        self.tree.tag_configure("even", background=theme.COLOR_CONTAINER)
        self.tree.tag_configure("odd", background="#222225")
        self.tree.tag_configure("dirty", background="#4a3e1d", foreground="#ffca28")

    def update_pager_controls(self):
        """Adjusts pager button states and page descriptions."""
        if self.page_size <= 0:
            self.page_size = 50
        
        total_pages = max(1, (self.total_records + self.page_size - 1) // self.page_size)
        
        # Page info text
        self.page_info_label.configure(text=f"Page {self.current_page} of {total_pages}")
        
        # Record count info
        offset = (self.current_page - 1) * self.page_size
        shown_end = min(offset + len(self.rows), self.total_records)
        shown_start = offset + 1 if len(self.rows) > 0 else 0
        self.totals_label.configure(text=f"Showing {shown_start}-{shown_end} of {self.total_records} records")
        
        # Set button states
        self.btn_first.configure(state="normal" if self.current_page > 1 else "disabled")
        self.btn_prev.configure(state="normal" if self.current_page > 1 else "disabled")
        self.btn_next.configure(state="normal" if self.current_page < total_pages else "disabled")
        self.btn_last.configure(state="normal" if self.current_page < total_pages else "disabled")

    # Sorting action
    def sort_by_column(self, col: str):
        if not self.table_name:
            return # Sort only enabled in table browsing mode
            
        if self.sort_column == col:
            # Toggle direction
            self.sort_descending = not self.sort_descending
        else:
            self.sort_column = col
            self.sort_descending = False
            
        self.current_page = 1 # Reset to page 1
        self.refresh_grid()

    # Search actions
    def trigger_search(self):
        self.search_text = self.search_var.get().strip()
        self.current_page = 1
        self.refresh_grid()

    def reset_search(self):
        self.search_var.set("")
        self.search_text = ""
        self.current_page = 1
        self.refresh_grid()

    # Pagination navigation
    def go_first(self):
        if self.current_page > 1:
            self.current_page = 1
            self.refresh_grid()

    def go_prev(self):
        if self.current_page > 1:
            self.current_page -= 1
            self.refresh_grid()

    def go_next(self):
        total_pages = max(1, (self.total_records + self.page_size - 1) // self.page_size)
        if self.current_page < total_pages:
            self.current_page += 1
            self.refresh_grid()

    def go_last(self):
        total_pages = max(1, (self.total_records + self.page_size - 1) // self.page_size)
        if self.current_page < total_pages:
            self.current_page = total_pages
            self.refresh_grid()

    def on_page_size_change(self, event=None):
        try:
            self.page_size = int(self.size_combo.get())
        except ValueError:
            self.page_size = 100
        self.current_page = 1
        self.refresh_grid()

    # Double click details dialog
    def inspect_record(self, event=None):
        selection = self.tree.selection()
        if not selection:
            return
        
        row_idx = int(selection[0])
        row_data = self.rows[row_idx]
        
        # Open record details dialog
        dialog = tk.Toplevel(self)
        dialog.title(f"Record Details (Row {row_idx + 1})")
        dialog.geometry("700x550")
        dialog.configure(bg=theme.COLOR_BG)
        dialog.transient(self)
        dialog.grab_set()
        
        # Center dialog
        dialog.update_idletasks()
        width = dialog.winfo_width()
        height = dialog.winfo_height()
        x = (dialog.winfo_screenwidth() // 2) - (width // 2)
        y = (dialog.winfo_screenheight() // 2) - (height // 2)
        dialog.geometry(f"{width}x{height}+{x}+{y}")
        
        # Main layout
        lbl_info = ttk.Label(
            dialog, 
            text=f"Selected row columns inspection. Read long texts or code segments clearly.",
            style="Muted.TLabel"
        )
        lbl_info.pack(fill="x", padx=15, pady=(15, 5))
        
        # Scrollable inspection container
        canvas_frame = ttk.Frame(dialog, style="Card.TFrame")
        canvas_frame.pack(fill="both", expand=True, padx=15, pady=5)
        
        canvas = tk.Canvas(canvas_frame, bg=theme.COLOR_CONTAINER, highlightthickness=0)
        scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=canvas.yview)
        scroll_content = ttk.Frame(canvas, style="Card.TFrame")
        
        scroll_content.bind(
            "<Configure>", 
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=scroll_content, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Configure columns within the inner scroll layout
        scroll_content.columnconfigure(0, weight=0, minsize=150)
        scroll_content.columnconfigure(1, weight=1)
        
        # Populating fields
        for idx, col_name in enumerate(self.headers):
            val = row_data[idx] if idx < len(row_data) else ""
            
            # Label
            lbl = ttk.Label(
                scroll_content, 
                text=col_name, 
                font=theme.FONT_BOLD,
                anchor="e",
                justify="right",
                style="Muted.TLabel"
            )
            lbl.grid(row=idx, column=0, sticky="ne", padx=(10, 15), pady=8)
            
            # Display area based on content length
            str_val = str(val)
            lines_count = len(str_val.split('\n'))
            
            if len(str_val) > 80 or lines_count > 1:
                # Textbox for larger data
                tb = tk.Text(
                    scroll_content,
                    bg=theme.COLOR_BG,
                    fg=theme.COLOR_TEXT_BRIGHT,
                    insertbackground=theme.COLOR_TEXT_BRIGHT,
                    font=theme.FONT_CODE,
                    relief="flat",
                    height=min(max(lines_count, 3), 8),
                    wrap="word"
                )
                tb.insert("1.0", str_val)
                # Read only textbox
                tb.configure(state="disabled")
                tb.grid(row=idx, column=1, sticky="ew", padx=(0, 10), pady=6)
            else:
                # Simple entry field
                ent = ttk.Entry(scroll_content)
                ent.insert(0, str_val)
                ent.configure(state="readonly")
                ent.grid(row=idx, column=1, sticky="ew", padx=(0, 10), pady=6)

        # Close action
        btn_close = ttk.Button(dialog, text="Close Details", command=dialog.destroy, style="TButton")
        btn_close.pack(pady=15)

    # Export records to CSV
    def export_csv(self):
        if not self.rows or not self.headers:
            messagebox.showwarning("Export Empty", "There is no data loaded in the grid to export.")
            return

        file_path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
            title="Export Grid Data to CSV"
        )
        if not file_path:
            return
            
        try:
            with open(file_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(self.headers)
                writer.writerows(self.rows)
                
            self.logger.success(f"Successfully exported data to CSV: {file_path}")
            messagebox.showinfo("Export Successful", f"Successfully saved records to CSV:\n{file_path}")
        except Exception as e:
            self.logger.error(f"Failed to export CSV: {str(e)}")
            messagebox.showerror("Export Failed", f"An error occurred writing to CSV file:\n{str(e)}")


class LoadingOverlay(ttk.Frame):
    """Overlay blocking user input during background tasks, displaying a cancel action."""
    def __init__(self, parent, cancel_callback=None, message="Processing database query...", **kwargs):
        super().__init__(parent, style="Card.TFrame", **kwargs)
        self.cancel_callback = cancel_callback
        
        inner = ttk.Frame(self, style="Card.TFrame")
        inner.place(relx=0.5, rely=0.5, anchor="center")
        
        self.icon_lbl = ttk.Label(inner, text="⏳", font=("Segoe UI", 28), foreground=theme.COLOR_ACCENT)
        self.icon_lbl.pack(pady=10)
        
        self.msg_lbl = ttk.Label(inner, text=message, font=theme.FONT_BOLD, justify="center")
        self.msg_lbl.pack(pady=5, padx=20)
        
        if self.cancel_callback:
            self.cancel_btn = ttk.Button(
                inner, 
                text="Cancel Operation", 
                command=self.cancel_callback, 
                style="Accent.TButton"
            )
            self.cancel_btn.pack(pady=10)
            
        self.anim_chars = ["|", "/", "-", "\\"]
        self.anim_idx = 0
        self._running = False
        
    def animate(self):
        if not self._running:
            return
        self.anim_idx = (self.anim_idx + 1) % len(self.anim_chars)
        char = self.anim_chars[self.anim_idx]
        self.icon_lbl.configure(text=f"⏳ {char}")
        self.after(150, self.animate)

    def show(self, msg=None):
        try:
            if not self.winfo_exists():
                return
            if msg:
                self.msg_lbl.configure(text=msg)
            self.place(relx=0, rely=0, relwidth=1, relheight=1)
            self.lift()
            self._running = True
            self.animate()
            self.update()
        except Exception:
            pass
        
    def hide(self):
        self._running = False
        try:
            if self.winfo_exists():
                self.place_forget()
        except Exception:
            pass


class DbDashboard(ttk.Frame):
    """Dashboard view showcasing key metrics, disk usage, configuration options, and table sizes."""
    def __init__(self, parent, db_manager, logger, run_async, **kwargs):
        super().__init__(parent, **kwargs)
        self.db = db_manager
        self.logger = logger
        self.run_async = run_async
        self.create_widgets()

    def create_widgets(self):
        self.canvas = tk.Canvas(self, bg=theme.COLOR_BG, highlightthickness=0)
        self.scroll = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.content = ttk.Frame(self.canvas)
        
        self.content.bind(
            "<Configure>", 
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        self.canvas.create_window((0, 0), window=self.content, anchor="nw", width=950)
        self.canvas.configure(yscrollcommand=self.scroll.set)
        
        self.canvas.pack(side="left", fill="both", expand=True)
        self.scroll.pack(side="right", fill="y")
        
        banner = ttk.Frame(self.content, style="Sidebar.TFrame")
        banner.pack(fill="x", padx=10, pady=10)
        ttk.Label(banner, text="🚀 DATABASE PERFORMANCE & STATUS METRICS", font=theme.FONT_TITLE, background=theme.COLOR_SIDEBAR).pack(padx=15, pady=12, anchor="w")

        cols_frame = ttk.Frame(self.content)
        cols_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        self.left_col = ttk.Frame(cols_frame, width=450)
        self.left_col.pack(side="left", fill="both", expand=True, padx=5)
        
        self.right_col = ttk.Frame(cols_frame, width=450)
        self.right_col.pack(side="right", fill="both", expand=True, padx=5)

        self.stats_card = ttk.Frame(self.left_col, style="Card.TFrame")
        self.stats_card.pack(fill="x", pady=5, ipady=10)
        ttk.Label(self.stats_card, text="🔧 CONFIGURATION & SIZE STATS", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER).pack(anchor="w", padx=15, pady=(10, 5))
        
        self.stats_labels = {}
        fields = [
            ("Path", "DB Path:"),
            ("size", "Size on Disk:"),
            ("page_size", "Database Page Size:"),
            ("page_count", "Total Pages count:"),
            ("freelist", "Unused Free Pages:"),
            ("journal", "Journaling Mode:"),
            ("fk", "Foreign Key constraints:")
        ]
        for key, text in fields:
            row = ttk.Frame(self.stats_card, style="Card.TFrame")
            row.pack(fill="x", padx=15, pady=3)
            ttk.Label(row, text=text, font=theme.FONT_BODY, background=theme.COLOR_CONTAINER, foreground=theme.COLOR_TEXT_MUTED).pack(side="left")
            lbl_val = ttk.Label(row, text="N/A", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER)
            lbl_val.pack(side="right")
            self.stats_labels[key] = lbl_val

        self.integrity_card = ttk.Frame(self.left_col, style="Card.TFrame")
        self.integrity_card.pack(fill="x", pady=10, ipady=10)
        ttk.Label(self.integrity_card, text="🛡️ STORAGE INTEGRITY CHECK", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER).pack(anchor="w", padx=15, pady=(10, 5))
        
        self.integrity_lbl = ttk.Label(self.integrity_card, text="Not checked", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER, foreground=theme.COLOR_SUCCESS)
        self.integrity_lbl.pack(anchor="w", padx=15, pady=5)
        
        ttk.Button(self.integrity_card, text="Verify DB Integrity", command=self.run_integrity_test).pack(anchor="w", padx=15, pady=5)

        self.chart_card = ttk.Frame(self.right_col, style="Card.TFrame")
        self.chart_card.pack(fill="both", expand=True, pady=5, ipady=10)
        ttk.Label(self.chart_card, text="📊 TABLE RECORD DENSITY DISTRIBUTION", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER).pack(anchor="w", padx=15, pady=(10, 5))
        
        self.chart_canvas = tk.Canvas(self.chart_card, bg=theme.COLOR_CONTAINER, height=300, highlightthickness=0)
        self.chart_canvas.pack(fill="both", expand=True, padx=15, pady=10)

    def refresh(self):
        if not self.db.is_connected():
            return
            
        def load_metrics():
            return self.db.get_db_stats()
            
        def on_success(stats):
            path_val = str(self.db.db_path)
            if len(path_val) > 40:
                path_val = "..." + path_val[-37:]
            self.stats_labels["Path"].configure(text=path_val)
            
            size_mb = stats["size_bytes"] / (1024 * 1024)
            self.stats_labels["size"].configure(text=f"{size_mb:.2f} MB")
            
            self.stats_labels["page_size"].configure(text=f"{stats['page_size']} bytes")
            self.stats_labels["page_count"].configure(text=str(stats["page_count"]))
            self.stats_labels["freelist"].configure(text=str(stats["freelist_count"]))
            self.stats_labels["journal"].configure(text=stats["journal_mode"].upper())
            self.stats_labels["fk"].configure(text=stats["foreign_keys"].upper())
            
            check_res = stats["integrity_check"]
            self.integrity_lbl.configure(
                text="PASS" if check_res == "ok" else str(check_res),
                foreground=theme.COLOR_SUCCESS if check_res == "ok" else theme.COLOR_ERROR
            )
            
            self.render_chart(stats["tables"])
            
        def on_error(err):
            self.logger.error(f"Failed to fetch dashboard metrics: {str(err)}")
            
        if self.run_async:
            self.run_async(load_metrics, (), on_success, on_error, "Fetching DB statistics...")
        else:
            try:
                on_success(load_metrics())
            except Exception as e:
                on_error(e)

    def run_integrity_test(self):
        if not self.db.is_connected():
            return
            
        def test():
            return self.db.run_integrity_check()
            
        def on_success(res):
            self.integrity_lbl.configure(
                text="PASS (Fully Verified)" if res == "ok" else str(res),
                foreground=theme.COLOR_SUCCESS if res == "ok" else theme.COLOR_ERROR
            )
            self.logger.success(f"Integrity check complete: {res}")
            messagebox.showinfo("Integrity Check Result", f"Database Integrity Verification:\n\n{res.upper()}")
            
        def on_error(err):
            self.logger.error(f"Integrity check failed: {str(err)}")
            
        if self.run_async:
            self.run_async(test, (), on_success, on_error, "Verifying database file blocks...")
        else:
            try:
                on_success(test())
            except Exception as e:
                on_error(e)

    def render_chart(self, tables):
        self.chart_canvas.delete("all")
        if not tables:
            self.chart_canvas.create_text(150, 150, text="No tables found to chart", fill=theme.COLOR_TEXT_MUTED, font=theme.FONT_BODY)
            return
            
        sorted_tables = sorted(tables, key=lambda t: t["rows"], reverse=True)[:6]
        max_rows = max((t["rows"] for t in sorted_tables), default=1)
        if max_rows == 0:
            max_rows = 1
            
        colors = ["#007acc", "#89d4a3", "#f48771", "#ce9178", "#b5cea8", "#569cd6"]
        
        y = 30
        for idx, table in enumerate(sorted_tables):
            name = table["name"]
            rows = table["rows"]
            
            lbl_text = f"{name} ({rows:,} rows)"
            self.chart_canvas.create_text(15, y, text=lbl_text, fill=theme.COLOR_TEXT, anchor="w", font=theme.FONT_BOLD)
            self.chart_canvas.create_rectangle(15, y + 12, 380, y + 22, fill=theme.COLOR_BG, outline=theme.COLOR_BORDER)
            
            ratio = rows / max_rows
            fill_width = 15 + int(365 * ratio)
            color = colors[idx % len(colors)]
            self.chart_canvas.create_rectangle(15, y + 12, fill_width, y + 22, fill=color, outline="")
            
            y += 42


class TableDesigner(tk.Toplevel):
    """A visual schema editing workbench to create or alter table column definitions."""
    def __init__(self, parent, db_manager, run_async, logger, table_name=None, on_success_callback=None):
        super().__init__(parent)
        self.db = db_manager
        self.run_async = run_async
        self.logger = logger
        self.table_name = table_name
        self.on_success = on_success_callback
        
        self.title("Visual Table Schema Designer")
        self.geometry("800x650")
        self.configure(bg=theme.COLOR_BG)
        self.transient(parent)
        self.grab_set()
        
        self.update_idletasks()
        x = (self.winfo_screenwidth() // 2) - 400
        y = (self.winfo_screenheight() // 2) - 325
        self.geometry(f"800x650+{x}+{y}")
        
        self.columns_list = []
        self.original_columns = []
        
        self.create_widgets()
        
        if self.table_name:
            self.load_existing_table()
        else:
            self.add_column_row()
            
    def create_widgets(self):
        top_frame = ttk.Frame(self, style="Card.TFrame")
        top_frame.pack(fill="x", padx=15, pady=10, ipady=5)
        
        ttk.Label(top_frame, text="Table Name:", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER).pack(side="left", padx=15)
        self.table_name_entry = ttk.Entry(top_frame, font=theme.FONT_HEADING, width=25)
        self.table_name_entry.pack(side="left", padx=5)
        
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=15, pady=2)
        
        ttk.Button(btn_frame, text="➕ Add Column", command=self.add_column_row).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="❌ Delete Column", command=self.delete_column_row).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="🔼 Move Up", command=self.move_up).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="🔽 Move Down", command=self.move_down).pack(side="left", padx=2)
        
        self.grid_frame = ttk.Frame(self)
        self.grid_frame.pack(fill="both", expand=True, padx=15, pady=5)
        
        scroll = ttk.Scrollbar(self.grid_frame, orient="vertical")
        scroll.pack(side="right", fill="y")
        
        self.tree = ttk.Treeview(self.grid_frame, selectmode="browse", yscrollcommand=scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scroll.configure(command=self.tree.yview)
        
        self.tree["columns"] = ("name", "type", "pk", "notnull", "default", "unique")
        self.tree.column("#0", width=40, stretch=False, anchor="center")
        self.tree.column("name", width=180, anchor="w")
        self.tree.column("type", width=100, anchor="center")
        self.tree.column("pk", width=60, anchor="center")
        self.tree.column("notnull", width=85, anchor="center")
        self.tree.column("default", width=120, anchor="w")
        self.tree.column("unique", width=65, anchor="center")
        
        self.tree.heading("#0", text="#")
        self.tree.heading("name", text="Column Name")
        self.tree.heading("type", text="Data Type")
        self.tree.heading("pk", text="Primary Key")
        self.tree.heading("notnull", text="Not Null")
        self.tree.heading("default", text="Default Value")
        self.tree.heading("unique", text="Unique")
        
        self.tree.bind("<Double-1>", self.on_grid_double_click)
        
        preview_frame = ttk.Frame(self, style="Card.TFrame")
        preview_frame.pack(fill="x", padx=15, pady=10)
        ttk.Label(preview_frame, text="Live SQL DDL Preview:", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER).pack(anchor="w", padx=15, pady=(5, 2))
        
        self.ddl_preview = tk.Text(preview_frame, bg="#111111", fg="#a9b7c6", font=theme.FONT_CODE, height=4, relief="flat", wrap="none")
        self.ddl_preview.pack(fill="x", padx=15, pady=(2, 8))
        self.ddl_preview.configure(state="disabled")
        
        bottom_frame = ttk.Frame(self)
        bottom_frame.pack(fill="x", padx=15, pady=10)
        
        ttk.Button(bottom_frame, text="💾 Save Changes", command=self.save_schema, style="Accent.TButton").pack(side="right", padx=5)
        ttk.Button(bottom_frame, text="Cancel", command=self.destroy).pack(side="right", padx=5)
        
    def add_column_row(self):
        idx = len(self.columns_list)
        col = {
            "name": f"column_{idx + 1}",
            "type": "INTEGER",
            "pk": False,
            "notnull": False,
            "default_value": "",
            "unique": False,
            "original_name": None
        }
        self.columns_list.append(col)
        self.render_tree()
        self.update_ddl_preview()
        
    def delete_column_row(self):
        selection = self.tree.selection()
        if not selection:
            return
        idx = int(selection[0])
        if idx >= 0 and idx < len(self.columns_list):
            self.columns_list.pop(idx)
            self.render_tree()
            self.update_ddl_preview()
            
    def move_up(self):
        selection = self.tree.selection()
        if not selection:
            return
        idx = int(selection[0])
        if idx > 0:
            self.columns_list[idx], self.columns_list[idx - 1] = self.columns_list[idx - 1], self.columns_list[idx]
            self.render_tree()
            self.tree.selection_set(str(idx - 1))
            self.update_ddl_preview()
            
    def move_down(self):
        selection = self.tree.selection()
        if not selection:
            return
        idx = int(selection[0])
        if idx < len(self.columns_list) - 1:
            self.columns_list[idx], self.columns_list[idx + 1] = self.columns_list[idx + 1], self.columns_list[idx]
            self.render_tree()
            self.tree.selection_set(str(idx + 1))
            self.update_ddl_preview()

    def render_tree(self):
        self.tree.delete(*self.tree.get_children())
        for idx, col in enumerate(self.columns_list):
            tag = "even" if idx % 2 == 0 else "odd"
            self.tree.insert(
                "", 
                "end", 
                iid=str(idx),
                text=str(idx + 1),
                values=(
                    col["name"],
                    col["type"],
                    "✔" if col["pk"] else "",
                    "✔" if col["notnull"] else "",
                    col["default_value"],
                    "✔" if col["unique"] else ""
                ),
                tags=(tag,)
            )
        self.tree.tag_configure("even", background=theme.COLOR_CONTAINER)
        self.tree.tag_configure("odd", background="#222225")

    def on_grid_double_click(self, event):
        row_id = self.tree.identify_row(event.y)
        col_id = self.tree.identify_column(event.x)
        if not row_id or not col_id:
            return
            
        row_idx = int(row_id)
        col_idx = int(col_id.replace("#", "")) - 1
        
        x, y, w, h = self.tree.bbox(row_id, col_id)
        col_name = self.tree["columns"][col_idx]
        
        if col_name == "name":
            entry = ttk.Entry(self.tree)
            entry.insert(0, self.columns_list[row_idx]["name"])
            entry.focus_set()
            entry.place(x=x, y=y, width=w, height=h)
            
            def save(event=None):
                val = entry.get().strip()
                if val:
                    self.columns_list[row_idx]["name"] = val
                    self.render_tree()
                    self.update_ddl_preview()
                entry.destroy()
            entry.bind("<Return>", save)
            entry.bind("<FocusOut>", save)
            
        elif col_name == "type":
            combo = ttk.Combobox(self.tree, values=["INTEGER", "TEXT", "REAL", "BLOB", "NUMERIC"], state="readonly")
            combo.set(self.columns_list[row_idx]["type"])
            combo.focus_set()
            combo.place(x=x, y=y, width=w, height=h)
            
            def save(event=None):
                self.columns_list[row_idx]["type"] = combo.get()
                self.render_tree()
                self.update_ddl_preview()
                combo.destroy()
            combo.bind("<<ComboboxSelected>>", save)
            combo.bind("<FocusOut>", lambda e: combo.destroy())
            
        elif col_name in ["pk", "notnull", "unique"]:
            prop = col_name
            self.columns_list[row_idx][prop] = not self.columns_list[row_idx][prop]
            self.render_tree()
            self.update_ddl_preview()
            
        elif col_name == "default":
            entry = ttk.Entry(self.tree)
            entry.insert(0, self.columns_list[row_idx]["default_value"])
            entry.focus_set()
            entry.place(x=x, y=y, width=w, height=h)
            
            def save(event=None):
                self.columns_list[row_idx]["default_value"] = entry.get()
                self.render_tree()
                self.update_ddl_preview()
                entry.destroy()
            entry.bind("<Return>", save)
            entry.bind("<FocusOut>", save)

    def load_existing_table(self):
        self.table_name_entry.delete(0, "end")
        self.table_name_entry.insert(0, self.table_name)
        schema = self.db.get_table_schema(self.table_name)
        
        self.columns_list = []
        for col in schema:
            self.columns_list.append({
                "name": col["name"],
                "type": col["type"],
                "pk": col["pk"],
                "notnull": col["notnull"],
                "default_value": str(col["default_value"]) if col["default_value"] is not None else "",
                "unique": False,
                "original_name": col["name"]
            })
        self.original_columns = [col["name"] for col in schema]
        self.render_tree()
        self.update_ddl_preview()
        
    def update_ddl_preview(self):
        name = self.table_name_entry.get().strip() or "table_name"
        ddl = f"CREATE TABLE \"{name}\" (\n"
        col_defs = []
        for col in self.columns_list:
            line = f"    \"{col['name']}\" {col['type']}"
            if col["pk"]:
                line += " PRIMARY KEY"
            if col["notnull"]:
                line += " NOT NULL"
            if col["default_value"] != "":
                line += f" DEFAULT {col['default_value']}"
            if col["unique"]:
                line += " UNIQUE"
            col_defs.append(line)
        ddl += ",\n".join(col_defs)
        ddl += "\n);"
        
        self.ddl_preview.configure(state="normal")
        self.ddl_preview.delete("1.0", "end")
        self.ddl_preview.insert("1.0", ddl)
        self.ddl_preview.configure(state="disabled")

    def save_schema(self):
        tbl_name = self.table_name_entry.get().strip()
        if not tbl_name:
            messagebox.showwarning("Table Name Empty", "Please enter a valid table name.")
            return
            
        if not self.columns_list:
            messagebox.showwarning("Columns Missing", "Table must have at least one column definition.")
            return
            
        mapping = {}
        for col in self.columns_list:
            mapping[col["name"]] = col["original_name"]

        def save_task():
            self.db.save_table_schema(
                self.table_name,
                tbl_name,
                self.columns_list,
                mapping
            )
            
        def on_success(result):
            self.logger.success(f"Visual schema alterations for table '{tbl_name}' committed successfully.")
            if self.on_success:
                self.on_success()
            self.destroy()
            
        def on_error(err):
            self.logger.error(f"Visual schema alteration failed: {str(err)}")
            messagebox.showerror("Alter Error", f"Failed to save structural updates:\n{str(err)}")
            
        if self.run_async:
            self.run_async(save_task, (), on_success, on_error, "Saving table structure schema...")
        else:
            try:
                save_task()
                on_success(None)
            except Exception as e:
                on_error(e)


class ErdVisualizer(ttk.Frame):
    """An interactive database design visualization panel displaying table structures and structural connections."""
    def __init__(self, parent, db_manager, run_async, logger, **kwargs):
        super().__init__(parent, **kwargs)
        self.db = db_manager
        self.run_async = run_async
        self.logger = logger
        
        self.nodes = {}
        self.drag_node = None
        self.drag_offset = (0, 0)
        
        self.create_widgets()
        
    def create_widgets(self):
        actions = ttk.Frame(self)
        actions.pack(fill="x", padx=5, pady=4)
        
        ttk.Label(actions, text="ENTITY-RELATIONSHIP DIAGRAM STUDIO", font=theme.FONT_BOLD).pack(side="left")
        
        ttk.Button(actions, text="🔄 Reload ERD Map", command=self.reload_erd).pack(side="right", padx=2)
        ttk.Button(actions, text="📐 Auto Layout", command=self.auto_layout).pack(side="right", padx=2)
        
        self.canvas_frame = ttk.Frame(self)
        self.canvas_frame.pack(fill="both", expand=True, padx=5, pady=2)
        
        self.scroll_y = ttk.Scrollbar(self.canvas_frame, orient="vertical")
        self.scroll_y.pack(side="right", fill="y")
        self.scroll_x = ttk.Scrollbar(self.canvas_frame, orient="horizontal")
        self.scroll_x.pack(side="bottom", fill="x")
        
        self.canvas = tk.Canvas(
            self.canvas_frame, 
            bg="#18181a", 
            xscrollcommand=self.scroll_x.set, 
            yscrollcommand=self.scroll_y.set,
            highlightthickness=0
        )
        self.canvas.pack(fill="both", expand=True)
        
        self.scroll_y.configure(command=self.canvas.yview)
        self.scroll_x.configure(command=self.canvas.xview)
        
        self.canvas.bind("<Button-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        
    def reload_erd(self):
        if not self.db.is_connected():
            return
            
        def build_relationships():
            tables = self.db.get_tables()
            rels = []
            schemas = {}
            for table in tables:
                schemas[table] = self.db.get_table_schema(table)
                
            rels = self.db.get_foreign_keys()
            return schemas, rels
            
        def on_success(result):
            schemas, rels = result
            self.schemas = schemas
            self.relationships = rels
            self.build_diagram()
            
        def on_error(err):
            self.logger.error(f"Failed to generate schema ERD: {str(err)}")
            
        if self.run_async:
            self.run_async(build_relationships, (), on_success, on_error, "Mapping database relationships...")
        else:
            try:
                on_success(build_relationships())
            except Exception as e:
                on_error(e)

    def build_diagram(self):
        self.canvas.delete("all")
        self.nodes = {}
        
        if not self.schemas:
            self.canvas.create_text(250, 200, text="Database contains no tables", fill=theme.COLOR_TEXT_MUTED, font=theme.FONT_TITLE)
            return

        self.auto_layout(render=False)
        self.draw_diagram()
        
    def auto_layout(self, render=True):
        if not hasattr(self, 'schemas') or not self.schemas:
            return
            
        num_tables = len(self.schemas)
        cols = int(num_tables ** 0.5) if num_tables > 1 else 1
        if cols == 0:
            cols = 1
            
        x_spacing = 320
        y_spacing = 260
        
        idx = 0
        for table, schema in self.schemas.items():
            r = idx // cols
            c = idx % cols
            
            h = 40 + (len(schema) * 20) + 10
            self.nodes[table] = {
                "x": 50 + (c * x_spacing),
                "y": 50 + (r * y_spacing),
                "w": 220,
                "h": h,
                "schema": schema
            }
            idx += 1
            
        if render:
            self.draw_diagram()
            
    def draw_diagram(self):
        self.canvas.delete("all")
        
        for rel in self.relationships:
            src = rel["source"]
            tgt = rel["target"]
            if src in self.nodes and tgt in self.nodes:
                n1 = self.nodes[src]
                n2 = self.nodes[tgt]
                
                x1 = n1["x"] + (n1["w"] / 2)
                y1 = n1["y"] + (n1["h"] / 2)
                x2 = n2["x"] + (n2["w"] / 2)
                y2 = n2["y"] + (n2["h"] / 2)
                
                self.canvas.create_line(
                    x1, y1, x2, y2, 
                    fill="#007acc", 
                    width=2, 
                    arrow="last", 
                    arrowshape=(10, 12, 4),
                    tags="connection"
                )
                
        for name, node in self.nodes.items():
            x, y, w, h = node["x"], node["y"], node["w"], node["h"]
            
            card_id = self.canvas.create_rectangle(
                x, y, x + w, y + h, 
                fill=theme.COLOR_CONTAINER, 
                outline=theme.COLOR_BORDER, 
                width=1,
                tags=f"node_{name}"
            )
            
            header_id = self.canvas.create_rectangle(
                x, y, x + w, y + 28, 
                fill=theme.COLOR_SIDEBAR, 
                outline=theme.COLOR_BORDER,
                width=1,
                tags=f"node_{name}"
            )
            
            text_id = self.canvas.create_text(
                x + 10, y + 14, 
                text=name.upper(), 
                fill=theme.COLOR_TEXT_BRIGHT, 
                font=theme.FONT_BOLD,
                anchor="w",
                tags=f"node_{name}"
            )
            
            cy = y + 42
            for col in node["schema"]:
                prefix = "🔑 " if col["pk"] else "  "
                col_text = f"{prefix}{col['name']} ({col['type']})"
                self.canvas.create_text(
                    x + 10, cy, 
                    text=col_text, 
                    fill=theme.COLOR_TEXT, 
                    font=theme.FONT_BODY,
                    anchor="w",
                    tags=f"node_{name}"
                )
                cy += 20
                
            node["id"] = f"node_{name}"
            
        self.canvas.tag_lower("connection")
        
        bbox = self.canvas.bbox("all")
        if bbox:
            self.canvas.configure(scrollregion=(bbox[0]-50, bbox[1]-50, bbox[2]+150, bbox[3]+150))

    def on_press(self, event):
        cx = self.canvas.canvasx(event.x)
        cy = self.canvas.canvasy(event.y)
        
        clicked_id = self.canvas.find_withtag("current")
        if not clicked_id:
            return
            
        tags = self.canvas.gettags(clicked_id[0])
        node_tag = [t for t in tags if t.startswith("node_")]
        if not node_tag:
            return
            
        table_name = node_tag[0].replace("node_", "")
        if table_name in self.nodes:
            self.drag_node = table_name
            node = self.nodes[table_name]
            self.drag_offset = (cx - node["x"], cy - node["y"])

    def on_drag(self, event):
        if not self.drag_node:
            return
            
        cx = self.canvas.canvasx(event.x)
        cy = self.canvas.canvasy(event.y)
        
        node = self.nodes[self.drag_node]
        node["x"] = cx - self.drag_offset[0]
        node["y"] = cy - self.drag_offset[1]
        
        self.draw_diagram()

    def on_release(self, event):
        self.drag_node = None


class QueryPlanViewer(tk.Toplevel):
    """Hierarchical Tree Explorer illustrating EXPLAIN QUERY PLAN evaluation rules."""
    def __init__(self, parent, db_manager, run_async, logger, query_str):
        super().__init__(parent)
        self.db = db_manager
        self.run_async = run_async
        self.logger = logger
        self.query_str = query_str
        
        self.title("Explain Query Execution Plan")
        self.geometry("650x450")
        self.configure(bg=theme.COLOR_BG)
        self.transient(parent)
        self.grab_set()
        
        self.update_idletasks()
        x = (self.winfo_screenwidth() // 2) - 325
        y = (self.winfo_screenheight() // 2) - 225
        self.geometry(f"650x450+{x}+{y}")
        
        self.create_widgets()
        self.run_explain()

    def create_widgets(self):
        top = ttk.Frame(self, style="Card.TFrame")
        top.pack(fill="x", padx=15, pady=10, ipady=5)
        
        ttk.Label(top, text="EXPLAIN QUERY PLAN ANALYSIS", font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER).pack(anchor="w", padx=15, pady=(5, 2))
        
        q_lbl = self.query_str.replace('\n', ' ')
        if len(q_lbl) > 75:
            q_lbl = q_lbl[:72] + "..."
        ttk.Label(top, text=q_lbl, font=theme.FONT_BODY, background=theme.COLOR_CONTAINER, foreground=theme.COLOR_TEXT_MUTED).pack(anchor="w", padx=15)
        
        self.grid_frame = ttk.Frame(self)
        self.grid_frame.pack(fill="both", expand=True, padx=15, pady=5)
        
        scroll = ttk.Scrollbar(self.grid_frame, orient="vertical")
        scroll.pack(side="right", fill="y")
        
        self.tree = ttk.Treeview(self.grid_frame, columns=("detail"), yscrollcommand=scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scroll.configure(command=self.tree.yview)
        
        self.tree.column("#0", width=100, minwidth=80, stretch=False)
        self.tree.column("detail", width=480, stretch=True, anchor="w")
        
        self.tree.heading("#0", text="Node Id (Order)")
        self.tree.heading("detail", text="Operator Execution Details")
        
        ttk.Button(self, text="Close Plan Explorer", command=self.destroy).pack(pady=10)

    def run_explain(self):
        def explain():
            return self.db.get_query_plan(self.query_str)
            
        def on_success(rows):
            self.tree.delete(*self.tree.get_children())
            for idx, r in enumerate(rows):
                node_id = f"{r[0]}.{r[1]}.{r[2]}"
                detail = r[3]
                tag = "even" if idx % 2 == 0 else "odd"
                self.tree.insert("", "end", iid=str(idx), text=node_id, values=(detail,), tags=(tag,))
                
            self.tree.tag_configure("even", background=theme.COLOR_CONTAINER)
            self.tree.tag_configure("odd", background="#222225")
            
        def on_error(err):
            self.logger.error(f"Explain query failed: {str(err)}")
            self.tree.insert("", "end", text="Error", values=(f"Failed to explain query: {str(err)}",))
            
        if self.run_async:
            self.run_async(explain, (), on_success, on_error, "Analyzing query performance steps...")
        else:
            try:
                on_success(explain())
            except Exception as e:
                on_error(e)


class ImportExportWizard(tk.Toplevel):
    """Step-by-step assistant wizard to perform CSV/JSON imports and exports."""
    def __init__(self, parent, db_manager, run_async, logger, mode="export", table_name=None, on_success_callback=None):
        super().__init__(parent)
        self.db = db_manager
        self.run_async = run_async
        self.logger = logger
        self.mode = mode
        self.table_name = table_name
        self.on_success = on_success_callback
        
        self.title("Data Migration Wizard")
        self.geometry("600x480")
        self.configure(bg=theme.COLOR_BG)
        self.transient(parent)
        self.grab_set()
        
        self.update_idletasks()
        x = (self.winfo_screenwidth() // 2) - 300
        y = (self.winfo_screenheight() // 2) - 240
        self.geometry(f"600x480+{x}+{y}")
        
        self.create_widgets()
        
    def create_widgets(self):
        top = ttk.Frame(self, style="Card.TFrame")
        top.pack(fill="x", padx=15, pady=10, ipady=5)
        
        title_text = "📥 DATA IMPORT WORKFLOW" if self.mode == "import" else "📥 DATA EXPORT WORKFLOW"
        ttk.Label(top, text=title_text, font=theme.FONT_BOLD, background=theme.COLOR_CONTAINER).pack(anchor="w", padx=15, pady=(5, 2))
        
        self.main_body = ttk.Frame(self)
        self.main_body.pack(fill="both", expand=True, padx=15, pady=5)
        
        if self.mode == "import":
            self.setup_import_ui()
        else:
            self.setup_export_ui()
            
    def setup_import_ui(self):
        r1 = ttk.Frame(self.main_body)
        r1.pack(fill="x", pady=6)
        ttk.Label(r1, text="Target Table:", font=theme.FONT_BOLD, width=15).pack(side="left")
        
        self.target_combo = ttk.Combobox(r1, values=self.db.get_tables(), state="readonly")
        if self.table_name:
            self.target_combo.set(self.table_name)
        self.target_combo.pack(side="left", fill="x", expand=True)
        
        r2 = ttk.Frame(self.main_body)
        r2.pack(fill="x", pady=6)
        ttk.Label(r2, text="Source File:", font=theme.FONT_BOLD, width=15).pack(side="left")
        
        self.import_path_entry = ttk.Entry(r2)
        self.import_path_entry.pack(side="left", fill="x", expand=True, padx=(0, 5))
        ttk.Button(r2, text="Browse...", command=self.browse_import_file).pack(side="right")
        
        r3 = ttk.Frame(self.main_body)
        r3.pack(fill="x", pady=6)
        ttk.Label(r3, text="Conflict Mode:", font=theme.FONT_BOLD, width=15).pack(side="left")
        
        self.conflict_combo = ttk.Combobox(r3, values=["INSERT", "INSERT OR IGNORE", "INSERT OR REPLACE"], state="readonly")
        self.conflict_combo.set("INSERT")
        self.conflict_combo.pack(side="left", fill="x", expand=True)
        
        ttk.Label(self.main_body, text="Import Progress & Logs:", font=theme.FONT_BOLD).pack(anchor="w", pady=(10, 2))
        self.import_log = tk.Text(self.main_body, bg="#111111", fg=theme.COLOR_TEXT, height=8, relief="flat", wrap="word")
        self.import_log.pack(fill="both", expand=True, pady=5)
        
        btn_frame = ttk.Frame(self.main_body)
        btn_frame.pack(fill="x", pady=10)
        ttk.Button(btn_frame, text="🚀 Execute Import", command=self.run_import, style="Accent.TButton").pack(side="right")
        ttk.Button(btn_frame, text="Close", command=self.destroy).pack(side="right", padx=5)

    def setup_export_ui(self):
        r1 = ttk.Frame(self.main_body)
        r1.pack(fill="x", pady=6)
        ttk.Label(r1, text="Source Table:", font=theme.FONT_BOLD, width=15).pack(side="left")
        
        self.source_combo = ttk.Combobox(r1, values=self.db.get_tables(), state="readonly")
        if self.table_name:
            self.source_combo.set(self.table_name)
        self.source_combo.pack(side="left", fill="x", expand=True)
        
        r2 = ttk.Frame(self.main_body)
        r2.pack(fill="x", pady=6)
        ttk.Label(r2, text="Save To File:", font=theme.FONT_BOLD, width=15).pack(side="left")
        
        self.export_path_entry = ttk.Entry(r2)
        self.export_path_entry.pack(side="left", fill="x", expand=True, padx=(0, 5))
        ttk.Button(r2, text="Browse...", command=self.browse_export_file).pack(side="right")
        
        r3 = ttk.Frame(self.main_body)
        r3.pack(fill="x", pady=6)
        ttk.Label(r3, text="Format Type:", font=theme.FONT_BOLD, width=15).pack(side="left")
        
        self.export_format_combo = ttk.Combobox(r3, values=["CSV", "JSON", "SQL Dump"], state="readonly")
        self.export_format_combo.set("CSV")
        self.export_format_combo.pack(side="left", fill="x", expand=True)
        self.export_format_combo.bind("<<ComboboxSelected>>", self.on_format_changed)
        
        ttk.Label(self.main_body, text="Export Execution Metrics:", font=theme.FONT_BOLD).pack(anchor="w", pady=(10, 2))
        self.export_log = tk.Text(self.main_body, bg="#111111", fg=theme.COLOR_TEXT, height=8, relief="flat", wrap="word")
        self.export_log.pack(fill="both", expand=True, pady=5)
        
        btn_frame = ttk.Frame(self.main_body)
        btn_frame.pack(fill="x", pady=10)
        ttk.Button(btn_frame, text="🚀 Execute Export", command=self.run_export, style="Accent.TButton").pack(side="right")
        ttk.Button(btn_frame, text="Close", command=self.destroy).pack(side="right", padx=5)

    def browse_import_file(self):
        f = filedialog.askopenfilename(
            filetypes=[("Data Files", "*.csv;*.json"), ("CSV Files", "*.csv"), ("JSON Files", "*.json"), ("All Files", "*.*")]
        )
        if f:
            self.import_path_entry.delete(0, "end")
            self.import_path_entry.insert(0, f)
            
    def browse_export_file(self):
        fmt = self.export_format_combo.get().lower()
        ext = ".csv" if fmt == "csv" else ".json" if fmt == "json" else ".sql"
        ftypes = [("CSV Files", "*.csv")] if fmt == "csv" else [("JSON Files", "*.json")] if fmt == "json" else [("SQL Scripts", "*.sql")]
        f = filedialog.asksaveasfilename(defaultextension=ext, filetypes=ftypes)
        if f:
            self.export_path_entry.delete(0, "end")
            self.export_path_entry.insert(0, f)

    def on_format_changed(self, event=None):
        path = self.export_path_entry.get().strip()
        if path:
            p = Path(path)
            fmt = self.export_format_combo.get().lower()
            ext = ".csv" if fmt == "csv" else ".json" if fmt == "json" else ".sql"
            new_path = p.with_suffix(ext)
            self.export_path_entry.delete(0, "end")
            self.export_path_entry.insert(0, str(new_path))

    def run_import(self):
        table = self.target_combo.get()
        path = self.import_path_entry.get().strip()
        conflict = self.conflict_combo.get()
        
        if not table or not path:
            messagebox.showwarning("Fields Missing", "Please select both a target table and import path.")
            return
            
        p = Path(path)
        if not p.exists():
            messagebox.showerror("File Not Found", "The import source file does not exist.")
            return
            
        self.import_log.delete("1.0", "end")
        self.import_log.insert("end", f"Reading source file: {path}...\n")
        
        def run_task():
            schema = self.db.get_table_schema(table)
            cols = [col["name"] for col in schema]
            rows = []
            
            if p.suffix.lower() == ".csv":
                with open(p, "r", encoding="utf-8") as f:
                    reader = csv.reader(f)
                    next(reader, None) # skip headers
                    for row in reader:
                        if len(row) < len(cols):
                            row += [None] * (len(cols) - len(row))
                        else:
                            row = row[:len(cols)]
                        cleaned_row = [None if val == "" else val for val in row]
                        rows.append(cleaned_row)
            else:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            row = []
                            for c in cols:
                                row.append(item.get(c, None))
                            rows.append(row)
                            
            return self.db.import_data(table, cols, rows, conflict)

        def on_success(count):
            msg = f"SUCCESS: Successfully imported {count} records into '{table}' table."
            self.import_log.insert("end", msg + "\n")
            self.logger.success(msg)
            if self.on_success:
                self.on_success()
                
        def on_error(err):
            self.import_log.insert("end", f"ERROR: Import failed: {str(err)}\n")
            self.logger.error(f"Migration import failed: {str(err)}")
            pass
            messagebox.showerror("Import Failed", f"An error occurred during import:\n{str(err)}")
            
        if self.run_async:
            self.run_async(run_task, (), on_success, on_error, "Executing batch data import...")
        else:
            try:
                on_success(run_task())
            except Exception as e:
                on_error(e)

    def run_export(self):
        table = self.source_combo.get()
        path = self.export_path_entry.get().strip()
        fmt = self.export_format_combo.get()
        
        if not table or not path:
            messagebox.showwarning("Fields Missing", "Please configure both the source table and save path.")
            return
            
        self.export_log.delete("1.0", "end")
        self.export_log.insert("end", f"Scanning table '{table}' datasets...\n")
        
        def run_task():
            headers, rows = self.db.get_all_table_data(table)
            safe_table = table.replace('"', '""')
            p = Path(path)
            if fmt == "CSV":
                with open(p, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(headers)
                    writer.writerows(rows)
            elif fmt == "JSON":
                data = []
                for row in rows:
                    item = {}
                    for idx, val in enumerate(row):
                        item[headers[idx]] = val
                    data.append(item)
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=4, default=str)
            else:
                ddl = self.db.get_table_ddl(table)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(ddl + ";\n\n")
                    
                    cols_str = ", ".join('"' + c.replace('"', '""') + '"' for c in headers)
                    for row in rows:
                        vals_list = []
                        for val in row:
                            if val is None:
                                vals_list.append("NULL")
                            elif isinstance(val, (int, float)):
                                vals_list.append(str(val))
                            else:
                                escaped_val = str(val).replace("'", "''")
                                vals_list.append(f"'{escaped_val}'")
                        vals_str = ", ".join(vals_list)
                        f.write(f'INSERT INTO public."{safe_table}" ({cols_str}) VALUES ({vals_str});\n')
            return len(rows)

        def on_success(count):
            msg = f"SUCCESS: Exported {count} records from '{table}' to {path}."
            self.export_log.insert("end", msg + "\n")
            self.logger.success(msg)
            
        def on_error(err):
            self.export_log.insert("end", f"ERROR: Export failed: {str(err)}\n")
            self.logger.error(f"Migration export failed: {str(err)}")
            messagebox.showerror("Export Failed", f"An error occurred writing to file:\n{str(err)}")
            
        if self.run_async:
            self.run_async(run_task, (), on_success, on_error, "Executing batch data export...")
        else:
            try:
                on_success(run_task())
            except Exception as e:
                on_error(e)


class SqlHistoryManager(ttk.Frame):
    """Favorites and code snippets sidebar utility to inject SQL blocks directly into the script editor."""
    def __init__(self, parent, editor_instance, logger, **kwargs):
        super().__init__(parent, **kwargs)
        self.editor = editor_instance
        self.logger = logger
        self.favorites = {}
        
        self.load_favorites()
        self.create_widgets()

    def create_widgets(self):
        header = ttk.Frame(self, style="Sidebar.TFrame")
        header.pack(fill="x", padx=5, pady=5)
        ttk.Label(header, text="FAVORITES & SNIPPETS", font=theme.FONT_BOLD, background=theme.COLOR_SIDEBAR).pack(side="left", padx=5)
        
        self.list_frame = ttk.Frame(self)
        self.list_frame.pack(fill="both", expand=True, padx=5, pady=2)
        
        scroll = ttk.Scrollbar(self.list_frame, orient="vertical")
        scroll.pack(side="right", fill="y")
        
        self.tree = ttk.Treeview(self.list_frame, yscrollcommand=scroll.set, show="tree")
        self.tree.pack(side="left", fill="both", expand=True)
        scroll.configure(command=self.tree.yview)
        
        self.tree.heading("#0", text="Snippet Name")
        self.tree.bind("<Double-1>", self.inject_snippet)
        
        ctrl = ttk.Frame(self)
        ctrl.pack(fill="x", padx=5, pady=5)
        
        ttk.Button(ctrl, text="Add Current Query", command=self.add_favorite).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(ctrl, text="❌ Remove", command=self.remove_favorite).pack(side="right", padx=2)
        
        self.refresh_list()

    def load_favorites(self):
        self.fav_file = Path(__file__).parent / "favorites.json"
        if self.fav_file.exists():
            try:
                with open(self.fav_file, "r") as f:
                    self.favorites = json.load(f)
            except Exception:
                self.favorites = {}
        if not self.favorites:
            self.favorites = {
                "Select Limit 100": "SELECT * FROM \"table_name\" LIMIT 100;",
                "Table Count aggregation": "SELECT COUNT(*) FROM \"table_name\";",
                "Left join template": "SELECT * FROM \"table_a\" a\nLEFT JOIN \"table_b\" b ON a.id = b.id;",
                "Safe Update records": "UPDATE \"table_name\"\nSET \"column_name\" = 'value'\nWHERE \"id\" = 1;"
            }
            self.save_favorites()

    def save_favorites(self):
        try:
            with open(self.fav_file, "w") as f:
                json.dump(self.favorites, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to save snippets favorites: {str(e)}")

    def refresh_list(self):
        self.tree.delete(*self.tree.get_children())
        for name in sorted(self.favorites.keys()):
            self.tree.insert("", "end", text=name, values=(name,))

    def inject_snippet(self, event=None):
        selection = self.tree.selection()
        if not selection:
            return
        item = selection[0]
        name = self.tree.item(item, "text")
        sql = self.favorites.get(name, "")
        if sql:
            self.editor.set_query(sql)
            self.logger.info(f"Injected SQL snippet: '{name}'")

    def add_favorite(self):
        sql = self.editor.get_query().strip()
        if not sql:
            messagebox.showwarning("Editor Empty", "No SQL query in the editor to save.")
            return
            
        dialog = tk.Toplevel(self)
        dialog.title("Save SQL Favorite")
        dialog.geometry("380x150")
        dialog.configure(bg=theme.COLOR_BG)
        dialog.transient(self)
        dialog.grab_set()
        
        dialog.update_idletasks()
        x = (dialog.winfo_screenwidth() // 2) - 190
        y = (dialog.winfo_screenheight() // 2) - 75
        dialog.geometry(f"380x150+{x}+{y}")
        
        ttk.Label(dialog, text="Enter Snippet / Favorite Name:", font=theme.FONT_BOLD).pack(pady=(15, 5))
        ent = ttk.Entry(dialog, width=35)
        ent.pack(pady=5)
        ent.focus_set()
        
        def save():
            name = ent.get().strip()
            if name:
                self.favorites[name] = sql
                self.save_favorites()
                self.refresh_list()
                self.logger.success(f"Saved favorite snippet: '{name}'")
                dialog.destroy()
                
        ttk.Button(dialog, text="Save Snippet", command=save, style="Accent.TButton").pack(pady=10)

    def remove_favorite(self):
        selection = self.tree.selection()
        if not selection:
            return
        item = selection[0]
        name = self.tree.item(item, "text")
        if name in self.favorites:
            del self.favorites[name]
            self.save_favorites()
            self.refresh_list()
            self.logger.success(f"Removed favorite snippet: '{name}'")

