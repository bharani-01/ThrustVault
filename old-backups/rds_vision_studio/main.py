import tkinter as tk
from tkinter import ttk
from tkinter import messagebox
from tkinter import filedialog
import json
import os
import ssl
import threading
import queue
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

# Local modules
import theme
from db_manager import DatabaseManager
from widgets import (
    ConsoleLogger, SqlEditor, PagedDataGridViewer, LoadingOverlay,
    DbDashboard, TableDesigner, ErdVisualizer, QueryPlanViewer,
    ImportExportWizard, SqlHistoryManager
)

# Settings configurations are omitted in PostgreSQL-only mode.

class SqliteVisionStudioApp:
    """
    Main Application Controller for SQLite Vision Studio.
    Coordinates database queries, visual widget updates, and configuration storage.
    """
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("ThrustVault AWS RDS Database Explorer")
        
        # Set initial window proportions and center it
        self.root.geometry("1200x750")
        self.root.minsize(900, 600)
        self.center_window()
        
        # Initialize DB Core
        self.db = DatabaseManager()
        self.loading_overlay = LoadingOverlay(self.root, cancel_callback=self.cancel_active_query)
        self.selected_table: Optional[str] = None
        self.cached_tables = []
        self.cached_views = []
        
        # Apply global stylesheet theme
        self.theme_mode = "dark"
        self.style = theme.apply_theme(self.root, self.theme_mode)

        # Build visual layout
        self.create_layout()
        
        # Clean shutdown protocol
        self.root.protocol("WM_DELETE_WINDOW", self.on_exit)

        # Log system readiness
        self.logger.success("UI widgets loaded successfully. Ready.")
        
        # Auto-connect to AWS RDS from .env on startup
        self.root.after(100, self.auto_connect_rds)

    def center_window(self):
        self.root.update_idletasks()
        width = 1200
        height = 750
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def run_async(self, func, args, success_callback, error_callback=None, message="Processing..."):
        self.loading_overlay.show(message)
        def worker():
            try:
                res = func(*args)
                self.root.after(0, lambda r=res: self.async_success(r, success_callback))
            except Exception as e:
                self.root.after(0, lambda err=e: self.async_error(err, error_callback))
        threading.Thread(target=worker, daemon=True).start()

    def async_success(self, result, callback):
        try:
            if not self.root.winfo_exists():
                return
        except Exception:
            return
        self.loading_overlay.hide()
        if callback:
            callback(result)

    def async_error(self, error, callback):
        try:
            if not self.root.winfo_exists():
                return
        except Exception:
            return
        self.loading_overlay.hide()
        if callback:
            callback(error)
        else:
            self.logger.error(f"Background task failed: {str(error)}")
            messagebox.showerror("Operation Failed", str(error))

    def cancel_active_query(self):
        self.logger.info("Interrupting running database operation...")
        self.db.interrupt()

    def create_layout(self):
        """Builds the primary UI structure containing top nav, sidebar, workspace tabs, and logs."""
        
        # 1. Top Navigation Bar
        top_bar = ttk.Frame(self.root, style="Sidebar.TFrame")
        top_bar.pack(fill="x", side="top", ipady=2)
        
        # Brand title
        brand_lbl = ttk.Label(top_bar, text=" ThrustVault RDS Studio ", style="Title.TLabel", background=theme.COLOR_SIDEBAR)
        brand_lbl.pack(side="left", padx=10, pady=5)
        
        # DB connection controls
        ttk.Label(top_bar, text="RDS Connection:", font=theme.FONT_BOLD, background=theme.COLOR_SIDEBAR).pack(side="left", padx=(15, 5))
        
        self.db_path_entry = ttk.Entry(top_bar, width=55)
        self.db_path_entry.pack(side="left", padx=5, pady=5)
        
        rds_btn = ttk.Button(top_bar, text="🔌 Connect AWS RDS...", command=self.connect_rds, style="Accent.TButton")
        rds_btn.pack(side="left", padx=5)

        ttk.Button(top_bar, text="🔄 Refresh Schema", command=self.refresh_schema).pack(side="left", padx=5)
        
        # Toggle theme button (extreme right)
        theme_btn = ttk.Button(top_bar, text="🌓 Toggle Theme", command=self.toggle_theme)
        theme_btn.pack(side="right", padx=10)

        # 2. Diagnostics Console (Bottom Panel)
        self.logger = ConsoleLogger(self.root)
        self.logger.pack(fill="x", side="bottom", padx=5, pady=5)

        # 3. Main Workspace Division (Paned Window)
        paned = ttk.Panedwindow(self.root, orient="horizontal")
        paned.pack(fill="both", expand=True, padx=5, pady=2)
        
        # Sidebar Frame (Left)
        sidebar = ttk.Frame(paned, style="Sidebar.TFrame", width=260)
        sidebar.pack(fill="both", expand=True)
        sidebar.pack_propagate(False) # Keep width fixed at 260px
        paned.add(sidebar, weight=1)
        
        # Header for Schema Explorer
        sidebar_title = ttk.Frame(sidebar, style="Sidebar.TFrame")
        sidebar_title.pack(fill="x", padx=8, pady=(8, 2))
        ttk.Label(sidebar_title, text="DATABASE SCHEMAS", style="Sidebar.TLabel").pack(side="left")
        
        # Filter table entry
        self.schema_filter_var = tk.StringVar()
        self.schema_filter_var.trace_add("write", lambda *args: self.populate_schema_tree())
        sf_entry = ttk.Entry(sidebar, textvariable=self.schema_filter_var, font=theme.FONT_BODY)
        sf_entry.pack(fill="x", padx=8, pady=(2, 6))
        sf_entry.insert(0, "")
        
        # Binding temporary hint text is handled by trace cleanly:
        # We can also add a placeholder label if needed, but simple filtering is very intuitive.

        # Sidebar Schema Treeview
        self.schema_tree = ttk.Treeview(sidebar, selectmode="browse", show="tree")
        self.schema_tree.pack(fill="both", expand=True, padx=8, pady=5)
        self.schema_tree.bind("<<TreeviewSelect>>", self.on_schema_item_selected)
        
        # Main Work Panel Notebook (Right)
        self.notebook = ttk.Notebook(paned)
        self.notebook.pack(fill="both", expand=True)
        paned.add(self.notebook, weight=4)

        # Workspace Tab 1: Paged Table Data Browser
        self.grid_viewer = PagedDataGridViewer(
            self.notebook, 
            data_fetch_callback=self.fetch_paged_table_data,
            logger=self.logger,
            db_manager=self.db,
            run_async_callback=self.run_async
        )
        self.notebook.add(self.grid_viewer, text="📋 Table Browser")

        # Workspace Tab 2: SQL Editor Studio
        sql_tab = ttk.Frame(self.notebook)
        self.notebook.add(sql_tab, text="⚡ SQL Editor")
        
        # Horizontal split: history sidebar (left), editor/grid (right)
        sql_h_split = ttk.Panedwindow(sql_tab, orient="horizontal")
        sql_h_split.pack(fill="both", expand=True)
        
        # SQL Right pane container
        sql_right_pane = ttk.Frame(sql_h_split)
        
        # Toolbar above tabs
        sql_tab_bar = ttk.Frame(sql_right_pane)
        sql_tab_bar.pack(fill="x", side="top", padx=5, pady=2)
        
        ttk.Button(sql_tab_bar, text="➕ New SQL Tab", command=self.add_new_sql_tab).pack(side="left", padx=2)
        ttk.Button(sql_tab_bar, text="❌ Close Tab", command=self.close_active_sql_tab).pack(side="left", padx=2)
        
        # SQL tabs Notebook
        self.sql_notebook = ttk.Notebook(sql_right_pane)
        self.sql_notebook.pack(fill="both", expand=True, side="bottom")
        self.sql_notebook.bind("<<NotebookTabChanged>>", self.on_sql_tab_changed)
        
        # Tab tracking variables
        self.sql_tabs = {}
        self.sql_tab_counter = 0
        
        # Initialize the first SQL Tab
        self.add_new_sql_tab()
        
        # Get active editor for snippets manager
        initial_editor = list(self.sql_tabs.values())[0]["editor"]
        self.history_mgr = SqlHistoryManager(sql_h_split, initial_editor, self.logger)
        
        sql_h_split.add(self.history_mgr, weight=1)
        sql_h_split.add(sql_right_pane, weight=4)

        # Workspace Tab 3: Table Schema Inspector
        schema_inspector_tab = ttk.Frame(self.notebook)
        self.notebook.add(schema_inspector_tab, text="🔧 Table Schema")
        
        # Vertical split inside schema tab for columns and indexes
        schema_paned = ttk.Panedwindow(schema_inspector_tab, orient="vertical")
        schema_paned.pack(fill="both", expand=True, padx=5, pady=5)
        
        # Column list
        col_frame = ttk.Frame(schema_paned)
        ttk.Label(col_frame, text="Columns Metadata", font=theme.FONT_BOLD).pack(anchor="w", pady=(2, 4))
        
        # Scrollbars and treeview for columns
        col_scroll = ttk.Scrollbar(col_frame, orient="vertical")
        col_scroll.pack(side="right", fill="y")
        self.col_info_tree = ttk.Treeview(col_frame, yscrollcommand=col_scroll.set, selectmode="none")
        self.col_info_tree.pack(side="left", fill="both", expand=True)
        col_scroll.configure(command=self.col_info_tree.yview)
        
        self.col_info_tree["columns"] = ("name", "type", "pk", "notnull", "default")
        self.col_info_tree.column("#0", width=40, stretch=False, anchor="center")
        self.col_info_tree.column("name", width=180, anchor="w")
        self.col_info_tree.column("type", width=120, anchor="w")
        self.col_info_tree.column("pk", width=80, anchor="center")
        self.col_info_tree.column("notnull", width=80, anchor="center")
        self.col_info_tree.column("default", width=150, anchor="w")
        
        self.col_info_tree.heading("#0", text="#")
        self.col_info_tree.heading("name", text="Column Name")
        self.col_info_tree.heading("type", text="Data Type")
        self.col_info_tree.heading("pk", text="Primary Key")
        self.col_info_tree.heading("notnull", text="Not Null")
        self.col_info_tree.heading("default", text="Default Value")
        
        schema_paned.add(col_frame, weight=3)
        
        # Indexes list
        idx_frame = ttk.Frame(schema_paned)
        ttk.Label(idx_frame, text="Indices Metadata", font=theme.FONT_BOLD).pack(anchor="w", pady=(10, 4))
        
        idx_scroll = ttk.Scrollbar(idx_frame, orient="vertical")
        idx_scroll.pack(side="right", fill="y")
        self.idx_info_tree = ttk.Treeview(idx_frame, yscrollcommand=idx_scroll.set, selectmode="none")
        self.idx_info_tree.pack(side="left", fill="both", expand=True)
        idx_scroll.configure(command=self.idx_info_tree.yview)
        
        self.idx_info_tree["columns"] = ("name", "unique", "columns")
        self.idx_info_tree.column("#0", width=40, stretch=False, anchor="center")
        self.idx_info_tree.column("name", width=250, anchor="w")
        self.idx_info_tree.column("unique", width=100, anchor="center")
        self.idx_info_tree.column("columns", width=300, anchor="w")
        
        self.idx_info_tree.heading("#0", text="#")
        self.idx_info_tree.heading("name", text="Index Name")
        self.idx_info_tree.heading("unique", text="Is Unique")
        self.idx_info_tree.heading("columns", text="Indexed Columns")
        
        schema_paned.add(idx_frame, weight=2)
        
        # Workspace Tab 4: Database Dashboard
        self.dashboard = DbDashboard(
            self.notebook, 
            self.db, 
            self.logger, 
            self.run_async
        )
        self.notebook.add(self.dashboard, text="📊 Dashboard")

        # Workspace Tab 5: Schema ERD Diagram
        self.erd_visualizer = ErdVisualizer(
            self.notebook, 
            self.db, 
            self.run_async, 
            self.logger
        )
        self.notebook.add(self.erd_visualizer, text="📐 ERD Map")

    # Config/settings and local database browse operations are omitted in PostgreSQL-only mode.

    def auto_connect_rds(self):
        # Load environment variables from .env
        script_dir = os.path.dirname(os.path.abspath(__file__))
        env_path = os.path.join(script_dir, '..', '.env')
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, val = line.split('=', 1)
                        key = key.strip()
                        val = val.strip()
                        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                            val = val[1:-1]
                        os.environ[key] = val
                        
        host = os.environ.get("DB_HOST", "database-2-instance-1.c768qwys6eaf.eu-north-1.rds.amazonaws.com")
        port_val = os.environ.get("DB_PORT", "5432")
        port = int(port_val if port_val else "5432")
        dbname = os.environ.get("DB_NAME", "postgres")
        user = os.environ.get("DB_USER", "postgres")
        password = os.environ.get("DB_PASSWORD", "ThrustVault321")
        use_iam = os.environ.get("USE_AWS_IAM_AUTH", "false").lower() in ['true', '1', 'yes']
        region = os.environ.get("AWS_REGION", "eu-north-1")
        
        self.logger.info(f"Auto-connecting to AWS RDS Postgres database '{dbname}' on {host}:{port}...")
        
        def connect_task():
            current_pass = password
            if use_iam:
                import boto3
                rds_client = boto3.client('rds', region_name=region)
                current_pass = rds_client.generate_db_auth_token(
                    DBHostname=host,
                    Port=port,
                    DBUsername=user,
                    Region=region
                )
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            self.db.connect_pg(
                host=host,
                port=port,
                database=dbname,
                user=user,
                password=current_pass,
                ssl_context=ssl_context
            )
            return dbname, user, host, port

        def on_success(res):
            dbname, user, host, port = res
            self.db_path_entry.delete(0, "end")
            self.db_path_entry.insert(0, f"postgresql://{user}@{host}:{port}/{dbname}")
            self.logger.success(f"Successfully auto-connected to AWS RDS database '{dbname}'")
            
            self.selected_table = None
            self.refresh_schema()
            
            tables = self.db.get_tables()
            if tables and tables[0] is not None:
                sample_table = tables[0]
                active_editor = self.get_active_editor()
                if active_editor:
                    active_editor.set_query(f'SELECT * FROM public."{sample_table}" LIMIT 100;')

        def on_error(err):
            self.logger.error(f"Failed to auto-connect to RDS: {err}")
            self.connect_rds()

        self.run_async(connect_task, (), on_success, on_error, f"Auto-connecting to AWS RDS Postgres database '{dbname}'...")

    def connect_rds(self):
        # Read from environment variables if loaded
        script_dir = os.path.dirname(os.path.abspath(__file__))
        env_path = os.path.join(script_dir, '..', '.env')
        
        # Load environment variables if they are not already loaded
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, val = line.split('=', 1)
                        key = key.strip()
                        val = val.strip()
                        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                            val = val[1:-1]
                        os.environ[key] = val
        
        DB_HOST = os.environ.get("DB_HOST", "database-2-instance-1.c768qwys6eaf.eu-north-1.rds.amazonaws.com")
        DB_PORT = os.environ.get("DB_PORT", "5432")
        DB_NAME = os.environ.get("DB_NAME", "postgres")
        DB_USER = os.environ.get("DB_USER", "postgres")
        DB_PASSWORD = os.environ.get("DB_PASSWORD", "ThrustVault321")
        USE_AWS_IAM_AUTH = os.environ.get("USE_AWS_IAM_AUTH", "false").lower() in ['true', '1', 'yes']
        AWS_REGION = os.environ.get("AWS_REGION", "eu-north-1")
        
        dialog = tk.Toplevel(self.root)
        dialog.title("Connect to AWS RDS / PostgreSQL")
        dialog.geometry("450x380")
        dialog.transient(self.root)
        dialog.grab_set()
        
        dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() // 2) - (dialog.winfo_width() // 2)
        y = self.root.winfo_y() + (self.root.winfo_height() // 2) - (dialog.winfo_height() // 2)
        dialog.geometry(f"+{x}+{y}")
        
        frame = ttk.Frame(dialog, padding=15)
        frame.pack(fill="both", expand=True)
        
        def add_field(row, label_text, default_val):
            ttk.Label(frame, text=label_text).grid(row=row, column=0, sticky="w", pady=5)
            entry = ttk.Entry(frame, width=35)
            entry.grid(row=row, column=1, sticky="ew", padx=(10, 0), pady=5)
            entry.insert(0, default_val)
            return entry
            
        host_entry = add_field(0, "Host:", DB_HOST)
        port_entry = add_field(1, "Port:", DB_PORT)
        db_entry = add_field(2, "Database:", DB_NAME)
        user_entry = add_field(3, "User:", DB_USER)
        
        ttk.Label(frame, text="Password:").grid(row=4, column=0, sticky="w", pady=5)
        pass_entry = ttk.Entry(frame, width=35, show="*")
        pass_entry.grid(row=4, column=1, sticky="ew", padx=(10, 0), pady=5)
        pass_entry.insert(0, DB_PASSWORD or "")
        
        iam_var = tk.BooleanVar(value=USE_AWS_IAM_AUTH)
        iam_cb = ttk.Checkbutton(frame, text="Use AWS IAM DB Auth", variable=iam_var)
        iam_cb.grid(row=5, column=1, sticky="w", pady=5, padx=(10, 0))
        
        def do_connect():
            host = host_entry.get().strip()
            port_val = port_entry.get().strip()
            port = int(port_val if port_val else "5432")
            dbname = db_entry.get().strip()
            user = user_entry.get().strip()
            password = pass_entry.get()
            use_iam = iam_var.get()
            
            self.logger.info(f"Connecting to AWS RDS Postgres database '{dbname}' on {host}:{port}...")
            
            def connect_task():
                current_pass = password
                if use_iam:
                    import boto3
                    rds_client = boto3.client('rds', region_name=AWS_REGION)
                    current_pass = rds_client.generate_db_auth_token(
                        DBHostname=host,
                        Port=port,
                        DBUsername=user,
                        Region=AWS_REGION
                    )
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                
                self.db.connect_pg(
                    host=host,
                    port=port,
                    database=dbname,
                    user=user,
                    password=current_pass,
                    ssl_context=ssl_context
                )
                return dbname, user, host, port

            def on_success(res):
                dbname, user, host, port = res
                self.db_path_entry.delete(0, "end")
                self.db_path_entry.insert(0, f"postgresql://{user}@{host}:{port}/{dbname}")
                self.logger.success(f"Successfully connected to RDS PostgreSQL database '{dbname}'")
                dialog.destroy()
                
                self.selected_table = None
                self.refresh_schema()
                
                tables = self.db.get_tables()
                if tables:
                    sample_table = tables[0]
                    active_editor = self.get_active_editor()
                    if active_editor:
                        active_editor.set_query(f'SELECT * FROM public."{sample_table}" LIMIT 100;')

            def on_error(err):
                self.logger.error(f"Connection failed: {err}")
                messagebox.showerror("Connection Error", f"Failed to connect to RDS:\n{err}")

            self.run_async(connect_task, (), on_success, on_error, f"Connecting to AWS RDS Postgres database '{dbname}'...")
                
        btn_connect = ttk.Button(frame, text="🔌 Connect", command=do_connect, style="Accent.TButton")
        btn_connect.grid(row=6, column=1, sticky="e", pady=15)

    # on_recent_selected is omitted in PostgreSQL-only mode.

    # Schema tree updates
    def refresh_schema(self):
        if not self.db.is_connected():
            self.schema_tree.delete(*self.schema_tree.get_children())
            self.cached_tables = []
            self.cached_views = []
            return
        
        self.logger.info("Scanning database tables & metadata...")
        
        def fetch_meta():
            tables = self.db.get_tables()
            views = self.db.get_views()
            table_info = []
            for t in tables:
                rows = self.db.get_table_row_count(t)
                table_info.append({"name": t, "rows": rows})
            return table_info, views

        def on_success(result):
            self.cached_tables, self.cached_views = result
            self.populate_schema_tree()
            # Refresh visual dashboard and ERD diagram
            self.dashboard.refresh()
            self.erd_visualizer.reload_erd()

        def on_error(err):
            self.logger.error(f"Failed to scan schema: {err}")

        self.run_async(fetch_meta, (), on_success, on_error, "Scanning remote database schema...")

    def populate_schema_tree(self):
        """Populates the hierarchical Sidebar tree view with quick search filtering."""
        self.schema_tree.delete(*self.schema_tree.get_children())
        
        filter_q = self.schema_filter_var.get().strip().lower()

        # Categories
        tables_node = self.schema_tree.insert("", "end", text="Tables", open=True)
        views_node = self.schema_tree.insert("", "end", text="Views", open=True)

        # Populate tables
        table_count = 0
        for table in self.cached_tables:
            name = table["name"]
            rows_num = table["rows"]
            if filter_q and filter_q not in name.lower():
                continue
            display_text = f"{name} ({rows_num})"
            self.schema_tree.insert(tables_node, "end", text=display_text, values=(name, "table"))
            table_count += 1

        # Populate views
        view_count = 0
        for view in self.cached_views:
            if filter_q and filter_q not in view.lower():
                continue
            self.schema_tree.insert(views_node, "end", text=view, values=(view, "view"))
            view_count += 1

        # Mute empty sections if filtering
        if not table_count and filter_q:
            self.schema_tree.delete(tables_node)
        if not view_count and filter_q:
            self.schema_tree.delete(views_node)

        self.logger.success(f"Sidebar schema refreshed. Found {len(self.cached_tables)} tables, {len(self.cached_views)} views.")

    # Sidebar click selection
    def on_schema_item_selected(self, event=None):
        selection = self.schema_tree.selection()
        if not selection:
            return
            
        item = selection[0]
        values = self.schema_tree.item(item, "values")
        
        if not values or len(values) < 2:
            return # Category header click
            
        entity_name = values[0]
        entity_type = values[1]
        
        self.selected_table = entity_name
        
        # Load details into workspaces
        self.grid_viewer.load_table(entity_name)
        self.load_schema_inspector(entity_name)
        
        # Switch to grid viewer tab automatically
        self.notebook.select(0)
        self.logger.info(f"Loaded entity: {entity_name} ({entity_type})")

    # Load details in schema inspector
    def load_schema_inspector(self, table_name: str):
        # Clear inspector trees
        self.col_info_tree.delete(*self.col_info_tree.get_children())
        self.idx_info_tree.delete(*self.idx_info_tree.get_children())

        def fetch_schema():
            columns = self.db.get_table_schema(table_name)
            indexes = self.db.get_table_indexes(table_name)
            return columns, indexes

        def on_success(data):
            columns, indexes = data
            for idx, col in enumerate(columns):
                tag = "even" if idx % 2 == 0 else "odd"
                self.col_info_tree.insert(
                    "", 
                    "end", 
                    text=str(idx + 1),
                    values=(
                        col["name"],
                        col["type"],
                        "✔" if col["pk"] else "",
                        "✔" if col["notnull"] else "",
                        str(col["default_value"]) if col["default_value"] is not None else ""
                    ),
                    tags=(tag,)
                )
            for idx, index in enumerate(indexes):
                tag = "even" if idx % 2 == 0 else "odd"
                self.idx_info_tree.insert(
                    "",
                    "end",
                    text=str(idx + 1),
                    values=(
                        index["name"],
                        "✔" if index["unique"] else "",
                        index["columns"]
                    ),
                    tags=(tag,)
                )

        def on_error(err):
            self.logger.error(f"Failed to load schema details for '{table_name}': {err}")

        self.run_async(fetch_schema, (), on_success, on_error, f"Loading schema details for '{table_name}'...")
        self.col_info_tree.tag_configure("even", background=theme.COLOR_CONTAINER)
        self.col_info_tree.tag_configure("odd", background="#222225")
        
        self.idx_info_tree.tag_configure("even", background=theme.COLOR_CONTAINER)
        self.idx_info_tree.tag_configure("odd", background="#222225")

    # Data fetching router callback
    def fetch_paged_table_data(
        self, 
        table_name: str, 
        limit: int, 
        offset: int, 
        sort_column: Optional[str] = None, 
        sort_descending: bool = False,
        search_query: Optional[str] = None
    ) -> Tuple[List[str], List[List[Any]], int]:
        """Bridge routing method called by PagedDataGridViewer."""
        return self.db.get_table_data_paged(
            table_name, limit, offset, sort_column, sort_descending, search_query
        )

    # Custom Query Run Router (Asynchronous & Tab-Specific)
    def add_new_sql_tab(self, initial_query: Optional[str] = None):
        self.sql_tab_counter += 1
        tab_frame = ttk.Frame(self.sql_notebook)
        
        # Vertical split inside this tab: top SQL Editor, bottom query result grid
        tab_v_paned = ttk.Panedwindow(tab_frame, orient="vertical")
        tab_v_paned.pack(fill="both", expand=True, padx=2, pady=2)
        
        # Build SQL Editor
        editor = SqlEditor(
            tab_v_paned,
            run_callback=lambda q: self.run_custom_query_async(q, tab_frame),
            logger=self.logger,
            db_manager=self.db,
            run_async_callback=self.run_async
        )
        tab_v_paned.add(editor, weight=2)
        
        # Build Results Grid
        grid = PagedDataGridViewer(
            tab_v_paned,
            data_fetch_callback=self.fetch_paged_table_data,
            logger=self.logger,
            db_manager=self.db,
            run_async_callback=self.run_async
        )
        tab_v_paned.add(grid, weight=3)
        
        # Store metadata
        self.sql_tabs[tab_frame] = {
            "editor": editor,
            "grid": grid,
            "id": self.sql_tab_counter
        }
        
        # Add to notebook
        self.sql_notebook.add(tab_frame, text=f"Query {self.sql_tab_counter}.sql")
        
        # Set active tab
        self.sql_notebook.select(tab_frame)
        
        # Prepopulate with query if provided
        if initial_query:
            editor.set_query(initial_query)
        elif self.db.is_connected():
            tables = self.db.get_tables()
            if tables and tables[0] is not None:
                sample_table = tables[0]
                safe_name = sample_table.replace('"', '""')
                editor.set_query(f'SELECT * FROM "{safe_name}" LIMIT 100;')
        
        # Highlight theme colors for new raw text widgets
        self.update_raw_widget_colors(tab_frame)

    def close_active_sql_tab(self):
        selected_tab = self.sql_notebook.select()
        if not selected_tab:
            return
        selected_widget = self.sql_notebook.nametowidget(selected_tab)
        
        # If this is the last tab, don't close, just clear the editor and results
        if len(self.sql_notebook.tabs()) <= 1:
            tab_data = self.sql_tabs.get(selected_widget)
            if tab_data:
                tab_data["editor"].clear_editor()
                tab_data["grid"].set_custom_results([], [], "Console cleared.")
            return
            
        # Remove metadata
        if selected_widget in self.sql_tabs:
            del self.sql_tabs[selected_widget]
            
        # Forget from notebook
        self.sql_notebook.forget(selected_tab)

    def on_sql_tab_changed(self, event=None):
        selected_tab = self.sql_notebook.select()
        if not selected_tab:
            return
        selected_widget = self.sql_notebook.nametowidget(selected_tab)
        tab_data = self.sql_tabs.get(selected_widget)
        if tab_data and hasattr(self, "history_mgr"):
            self.history_mgr.editor = tab_data["editor"]

    def get_active_editor(self) -> Optional[SqlEditor]:
        selected_tab = self.sql_notebook.select()
        if not selected_tab:
            return None
        selected_widget = self.sql_notebook.nametowidget(selected_tab)
        tab_data = self.sql_tabs.get(selected_widget)
        return tab_data["editor"] if tab_data else None

    def run_custom_query_async(self, sql_query: str, tab_frame: ttk.Frame):
        if not self.db.is_connected():
            messagebox.showwarning("No Database", "Connect to a database before executing SQL.")
            return

        tab_data = self.sql_tabs.get(tab_frame)
        if not tab_data:
            return
        
        editor = tab_data["editor"]
        grid = tab_data["grid"]

        # Disable run/explain actions during query execution
        editor.run_btn.configure(state="disabled")
        editor.explain_btn.configure(state="disabled")
        grid.set_custom_results([], [], "Executing query in background thread...")
        self.logger.info("Executing custom SQL statement asynchronously...")

        def worker():
            try:
                headers, rows, status_msg, duration = self.db.execute_query(sql_query)
                self.root.after(0, lambda: self.on_query_success(tab_frame, sql_query, headers, rows, status_msg, duration))
            except Exception as e:
                self.root.after(0, lambda err=e: self.on_query_error(tab_frame, err))

        threading.Thread(target=worker, daemon=True).start()

    def on_query_success(self, tab_frame: ttk.Frame, sql_query: str, headers: List[str], rows: List[List[Any]], status_msg: str, duration: float):
        tab_data = self.sql_tabs.get(tab_frame)
        if not tab_data:
            return
        
        editor = tab_data["editor"]
        grid = tab_data["grid"]

        # Re-enable editor query actions
        editor.run_btn.configure(state="normal")
        editor.explain_btn.configure(state="normal")

        # Log query completion
        self.logger.query(sql_query, duration)
        
        if "Error" in status_msg or "SQL Error" in status_msg:
            self.logger.error(status_msg)
            messagebox.showerror("Execution Failed", status_msg)
            grid.set_custom_results([], [], status_msg)
        else:
            # Display results in grid
            grid.set_custom_results(headers, rows, status_msg)
            
        # Re-trigger syntax linter checking after execution
        editor.lint_sql()

    def on_query_error(self, tab_frame: ttk.Frame, error: Exception):
        tab_data = self.sql_tabs.get(tab_frame)
        if not tab_data:
            return
        
        editor = tab_data["editor"]
        grid = tab_data["grid"]
        
        editor.run_btn.configure(state="normal")
        editor.explain_btn.configure(state="normal")

        err_msg = f"Thread exception: {str(error)}"
        self.logger.error(err_msg)
        messagebox.showerror("Execution Failed", err_msg)
        grid.set_custom_results([], [], err_msg)
        editor.lint_sql()

    def open_create_table(self):
        if not self.db.is_connected():
            messagebox.showwarning("No Database", "Connect to a database before creating tables.")
            return
        TableDesigner(
            self.root, 
            self.db, 
            self.run_async, 
            self.logger, 
            on_success_callback=self.refresh_schema
        )

    def open_alter_table(self):
        if not self.db.is_connected():
            messagebox.showwarning("No Database", "Connect to a database before modifying tables.")
            return
        if not self.selected_table:
            messagebox.showwarning("Selection Missing", "Please select a table in the sidebar explorer to alter.")
            return
        TableDesigner(
            self.root, 
            self.db, 
            self.run_async, 
            self.logger, 
            table_name=self.selected_table,
            on_success_callback=self.refresh_schema
        )

    def open_import_wizard(self):
        if not self.db.is_connected():
            messagebox.showwarning("No Database", "Connect to a database before importing data.")
            return
        ImportExportWizard(
            self.root, 
            self.db, 
            self.run_async, 
            self.logger, 
            mode="import", 
            table_name=self.selected_table,
            on_success_callback=self.on_data_imported
        )

    def open_export_wizard(self):
        if not self.db.is_connected():
            messagebox.showwarning("No Database", "Connect to a database before exporting data.")
            return
        ImportExportWizard(
            self.root, 
            self.db, 
            self.run_async, 
            self.logger, 
            mode="export", 
            table_name=self.selected_table
        )

    def on_data_imported(self):
        if self.selected_table:
            self.grid_viewer.load_table(self.selected_table)
        self.refresh_schema()

    def toggle_theme(self):
        self.theme_mode = "light" if self.theme_mode == "dark" else "dark"
        theme.apply_theme(self.root, self.theme_mode)
        self.logger.info(f"Theme switched to {self.theme_mode.upper()} mode.")
        
        # Update styling of non-TTK raw widgets
        self.update_raw_widget_colors(self.root)
        
        # Refresh drawing canvases
        self.dashboard.refresh()
        self.erd_visualizer.reload_erd()

    def update_raw_widget_colors(self, widget):
        cls = widget.winfo_class()
        if cls == "Text":
            if self.theme_mode == "dark":
                widget.configure(bg="#181818", fg=theme.COLOR_TEXT, insertbackground="#ffffff")
            else:
                widget.configure(bg="#ffffff", fg=theme.COLOR_TEXT, insertbackground="#000000")
        elif cls == "Canvas":
            db_inst = getattr(self, 'dashboard', None)
            chart_canvas = getattr(db_inst, 'chart_canvas', None) if db_inst else None
            if self.theme_mode == "dark":
                widget.configure(bg="#18181a" if widget != chart_canvas else theme.COLOR_CONTAINER)
            else:
                widget.configure(bg="#ffffff" if widget != chart_canvas else theme.COLOR_CONTAINER)
                
        for child in widget.winfo_children():
            self.update_raw_widget_colors(child)

    def on_exit(self):
        """Perform cleanup processes before exiting the application."""
        self.logger.info("Closing application connections...")
        self.db.close()
        self.root.destroy()


def main():
    root = tk.Tk()
    app = SqliteVisionStudioApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
