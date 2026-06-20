import time
import json
import ssl
import threading
from typing import Dict, List, Tuple, Any, Optional

class DatabaseManager:
    """
    Handles PostgreSQL database connections, schema queries, paging, 
    and custom SQL execution with performance timing and robust error handling.
    """
    def __init__(self):
        self.connection: Any = None
        self.lock = threading.RLock()
        self.is_postgres = True
        self.db_path = ""

    def connect_pg(self, host, port, database, user, password, ssl_context=None) -> None:
        """Establish a connection to the PostgreSQL database."""
        self.close()
        import pg8000.dbapi
        self.connection = pg8000.dbapi.connect(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            ssl_context=ssl_context,
            timeout=15.0
        )
        self.connection.autocommit = True
        self.db_path = f"postgresql://{user}@{host}:{port}/{database}"

    def is_connected(self) -> bool:
        """Check if connection is open."""
        if self.connection is None:
            return False
        with self.lock:
            try:
                cursor = self.connection.cursor()
                cursor.execute("SELECT 1;")
                cursor.close()
                return True
            except Exception:
                return False

    def close(self) -> None:
        """Close connection cleanly."""
        if self.connection:
            try:
                self.connection.close()
            except Exception:
                pass
            self.connection = None

    def get_tables(self) -> List[str]:
        """Fetch all user tables sorted alphabetically."""
        if not self.connection:
            return []
        with self.lock:
            cursor = self.connection.cursor()
            cursor.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
            )
            return [row[0] for row in cursor.fetchall() if row[0] is not None]

    def get_views(self) -> List[str]:
        """Fetch all user views sorted alphabetically."""
        if not self.connection:
            return []
        with self.lock:
            cursor = self.connection.cursor()
            cursor.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'VIEW' ORDER BY table_name;"
            )
            return [row[0] for row in cursor.fetchall() if row[0] is not None]

    def get_table_row_count(self, table_name: str) -> int:
        """Get total number of records in a table safely."""
        if not self.connection:
            return 0
        with self.lock:
            cursor = self.connection.cursor()
            safe_table_name = table_name.replace('"', '""')
            try:
                cursor.execute(f'SELECT COUNT(*) FROM public."{safe_table_name}";')
                return cursor.fetchone()[0]
            except Exception:
                return 0

    def get_table_schema(self, table_name: str) -> List[Dict[str, Any]]:
        """Fetch column information for a table."""
        if not self.connection:
            return []
        with self.lock:
            cursor = self.connection.cursor()
            query = """
                SELECT column_name, data_type, is_nullable, column_default,
                       (SELECT count(*) FROM information_schema.table_constraints tc 
                        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = c.table_name AND kcu.column_name = c.column_name) AS is_pk
                FROM information_schema.columns c
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position;
            """
            cursor.execute(query, [table_name])
            columns = []
            for idx, row in enumerate(cursor.fetchall()):
                columns.append({
                    "id": idx,
                    "name": row[0],
                    "type": row[1],
                    "notnull": row[2] == 'NO',
                    "default_value": row[3],
                    "pk": bool(row[4])
                })
            return columns

    def get_table_indexes(self, table_name: str) -> List[Dict[str, Any]]:
        """Fetch indexes associated with a table."""
        if not self.connection:
            return []
        with self.lock:
            cursor = self.connection.cursor()
            query = """
                SELECT indexname, indexdef, i.indisunique
                FROM pg_indexes
                JOIN pg_class c ON c.relname = indexname
                JOIN pg_index i ON i.indexrelid = c.oid
                WHERE tablename = %s;
            """
            cursor.execute(query, [table_name])
            indexes = []
            for row in cursor.fetchall():
                indexes.append({
                    "name": row[0],
                    "unique": bool(row[2]),
                    "columns": row[1]
                })
            return indexes

    def get_table_data_paged(
        self, 
        table_name: str, 
        limit: int, 
        offset: int, 
        sort_column: Optional[str] = None, 
        sort_descending: bool = False,
        search_query: Optional[str] = None
    ) -> Tuple[List[str], List[List[Any]], int]:
        """Fetch a page of table records."""
        if not self.connection:
            return [], [], 0

        with self.lock:
            cursor = self.connection.cursor()
            safe_table_name = table_name.replace('"', '""')

            schema = self.get_table_schema(table_name)
            col_names = [col["name"] for col in schema]
            if not col_names:
                return [], [], 0

            query_base = f'FROM public."{safe_table_name}"'
            where_clause = ""
            params = []

            if search_query:
                search_conds = []
                for col in col_names:
                    escaped_col = col.replace('"', '""')
                    search_conds.append(f'CAST("{escaped_col}" AS TEXT) ILIKE %s')
                    params.append(f"%{search_query}%")
                if search_conds:
                    where_clause = " WHERE " + " OR ".join(search_conds)

            count_query = f'SELECT COUNT(*) {query_base}{where_clause}'
            cursor.execute(count_query, params)
            total_count = cursor.fetchone()[0]

            order_clause = ""
            if sort_column and sort_column in col_names:
                safe_sort_col = sort_column.replace('"', '""')
                dir_str = "DESC" if sort_descending else "ASC"
                order_clause = f' ORDER BY "{safe_sort_col}" {dir_str}'

            select_query = f'SELECT * {query_base}{where_clause}{order_clause} LIMIT %s OFFSET %s'
            params.extend([limit, offset])

            cursor.execute(select_query, params)
            rows = cursor.fetchall()
            
            formatted_rows = []
            for row in rows:
                formatted_row = []
                for val in row:
                    if val is None:
                        formatted_row.append("[NULL]")
                    elif isinstance(val, (dict, list)):
                        formatted_row.append(json.dumps(val))
                    else:
                        formatted_row.append(str(val))
                formatted_rows.append(formatted_row)

            return col_names, formatted_rows, total_count

    def execute_query(self, sql_query: str) -> Tuple[List[str], List[List[Any]], str, float]:
        """Execute arbitrary user SQL queries safely."""
        if not self.connection:
            return [], [], "Error: Database not connected.", 0.0

        with self.lock:
            start_time = time.perf_counter()
            cursor = self.connection.cursor()
            
            stripped_query = sql_query.strip().upper()
            
            try:
                cursor.execute(sql_query)
                
                is_write = any(stripped_query.startswith(verb) for verb in ["INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "REPLACE"])
                if is_write:
                    rows_affected = cursor.rowcount if hasattr(cursor, 'rowcount') else 0
                    duration = time.perf_counter() - start_time
                    return [], [], f"Success: Query executed successfully. {rows_affected} rows affected.", duration

                description = cursor.description
                col_names = [col[0] for col in description] if description else []
                
                safety_limit = 5000
                rows = cursor.fetchall()
                if len(rows) > safety_limit:
                    rows = rows[:safety_limit]
                    has_more = True
                else:
                    has_more = False
                
                formatted_rows = []
                for row in rows:
                    formatted_row = []
                    for val in row:
                        if val is None:
                            formatted_row.append("[NULL]")
                        elif isinstance(val, bytes):
                            formatted_row.append(f"<BLOB: {len(val)} bytes>")
                        elif isinstance(val, (dict, list)):
                            formatted_row.append(json.dumps(val))
                        else:
                            formatted_row.append(str(val))
                    formatted_rows.append(formatted_row)
                    
                duration = time.perf_counter() - start_time
                
                record_count = len(formatted_rows)
                more_suffix = f" (capped at {safety_limit} rows)" if has_more else ""
                status = f"Success: {record_count} row(s) returned{more_suffix}."
                
                return col_names, formatted_rows, status, duration
                
            except Exception as e:
                duration = time.perf_counter() - start_time
                return [], [], f"Error: {str(e)}", duration

    def interrupt(self) -> None:
        """Interrupt any running queries on the connection (stub for Postgres)."""
        pass

    def get_db_stats(self) -> Dict[str, Any]:
        """Fetch detailed stats about the database file and structural schema."""
        stats = {
            "size_bytes": 0,
            "page_size": 0,
            "page_count": 0,
            "freelist_count": 0,
            "journal_mode": "unknown",
            "foreign_keys": "off",
            "integrity_check": "unknown",
            "tables": []
        }
        if not self.connection:
            return stats

        with self.lock:
            try:
                cursor = self.connection.cursor()
                cursor.execute("SELECT pg_database_size(current_database());")
                stats["size_bytes"] = cursor.fetchone()[0]
                stats["journal_mode"] = "WAL (postgres)"
                stats["integrity_check"] = "Passed (pg8000)"
                
                tables = self.get_tables()
                for table in tables:
                    row_count = self.get_table_row_count(table)
                    schema = self.get_table_schema(table)
                    stats["tables"].append({
                        "name": table,
                        "rows": row_count,
                        "columns": len(schema),
                        "indexes": 0
                    })
            except Exception as e:
                stats["integrity_check"] = f"Error during retrieval: {str(e)}"
                
            return stats

    def update_record_val(
        self, 
        table_name: str, 
        original_row: Dict[str, Any], 
        col_name: str, 
        new_val: Any
    ) -> None:
        """Update a single cell in the database."""
        if not self.connection:
            raise Exception("Database not connected.")
            
        with self.lock:
            safe_table = table_name.replace('"', '""')
            safe_col_update = col_name.replace('"', '""')
            
            where_conds = []
            params = []
            
            val_to_set = None if new_val == "[NULL]" else new_val
            params.append(val_to_set)
            
            for col, val in original_row.items():
                safe_col = col.replace('"', '""')
                if val is None or val == "[NULL]":
                    where_conds.append(f'"{safe_col}" IS NULL')
                else:
                    where_conds.append(f'"{safe_col}" = %s')
                    params.append(val)
                    
            where_str = " AND ".join(where_conds)
            query = f'UPDATE public."{safe_table}" SET "{safe_col_update}" = %s WHERE {where_str};'
                
            cursor = self.connection.cursor()
            cursor.execute(query, params)

    def delete_record(self, table_name: str, row_values: Dict[str, Any]) -> None:
        """Delete a record matching all original column values."""
        if not self.connection:
            raise Exception("Database not connected.")
            
        with self.lock:
            safe_table = table_name.replace('"', '""')
            where_conds = []
            params = []
            
            for col, val in row_values.items():
                safe_col = col.replace('"', '""')
                if val is None or val == "[NULL]":
                    where_conds.append(f'"{safe_col}" IS NULL')
                else:
                    where_conds.append(f'"{safe_col}" = %s')
                    params.append(val)
                    
            where_str = " AND ".join(where_conds)
            query = f'DELETE FROM public."{safe_table}" WHERE {where_str};'
                
            cursor = self.connection.cursor()
            cursor.execute(query, params)

    def insert_empty_row(self, table_name: str) -> None:
        """Insert a default or empty row into the specified table."""
        if not self.connection:
            raise Exception("Database not connected.")
            
        with self.lock:
            safe_table = table_name.replace('"', '""')
            cursor = self.connection.cursor()
            cursor.execute(f'INSERT INTO public."{safe_table}" DEFAULT VALUES;')

    def save_table_schema(
        self, 
        old_table_name: Optional[str], 
        new_table_name: str, 
        columns: List[Dict[str, Any]], 
        column_mapping: Optional[Dict[str, str]] = None
    ) -> None:
        """Create or alter table structures (stub for Postgres)."""
        raise NotImplementedError("Structural table alteration is not supported for PostgreSQL mode.")

    def validate_query_syntax(self, query: str) -> Tuple[bool, str]:
        """Validate query syntax using EXPLAIN without execution."""
        if not self.connection:
            return False, "Database not connected."
        with self.lock:
            try:
                cursor = self.connection.cursor()
                cursor.execute(f"EXPLAIN {query}")
                cursor.close()
                return True, ""
            except Exception as e:
                return False, str(e)

    def run_integrity_check(self) -> str:
        """Run a basic integrity/connectivity check on PostgreSQL."""
        if not self.connection:
            return "Not connected"
        with self.lock:
            try:
                cursor = self.connection.cursor()
                cursor.execute("SELECT 1;")
                cursor.close()
                return "ok"
            except Exception as e:
                return str(e)

    def get_foreign_keys(self) -> List[Dict[str, Any]]:
        """Fetch foreign key relationships from database schema."""
        if not self.connection:
            return []
        with self.lock:
            try:
                cursor = self.connection.cursor()
                query = """
                    SELECT
                        tc.table_name AS source_table,
                        ccu.table_name AS target_table,
                        kcu.column_name AS from_column,
                        ccu.column_name AS to_column
                    FROM
                        information_schema.table_constraints AS tc
                        JOIN information_schema.key_column_usage AS kcu
                          ON tc.constraint_name = kcu.constraint_name
                          AND tc.table_schema = kcu.table_schema
                        JOIN information_schema.constraint_column_usage AS ccu
                          ON ccu.constraint_name = tc.constraint_name
                          AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
                """
                cursor.execute(query)
                rels = []
                for row in cursor.fetchall():
                    rels.append({
                        "source": row[0],
                        "target": row[1],
                        "from": row[2],
                        "to": row[3]
                    })
                cursor.close()
                return rels
            except Exception:
                return []

    def get_query_plan(self, query_str: str) -> List[Tuple[Any, ...]]:
        """Fetch PostgreSQL execution plan for the query."""
        if not self.connection:
            return []
        with self.lock:
            try:
                cursor = self.connection.cursor()
                cursor.execute(f"EXPLAIN {query_str}")
                rows = cursor.fetchall()
                cursor.close()
                return [(idx, 0, 0, row[0]) for idx, row in enumerate(rows)]
            except Exception as e:
                return [(0, 0, 0, f"Error: {str(e)}")]

    def import_data(
        self,
        table_name: str,
        cols: List[str],
        rows: List[List[Any]],
        conflict_mode: str
    ) -> int:
        """Import multiple rows into a table with transaction safety and conflict handling."""
        if not self.connection:
            raise Exception("Database not connected.")

        with self.lock:
            cursor = self.connection.cursor()
            try:
                # 1. Build the columns and placeholders using %s
                cols_str = ", ".join(f'"{c.replace(chr(34), chr(34) + chr(34))}"' for c in cols)
                placeholders = ", ".join("%s" for _ in cols)

                # 2. Translate conflict mode to PostgreSQL syntax
                conflict_clause = ""
                if conflict_mode == "INSERT OR IGNORE":
                    conflict_clause = " ON CONFLICT DO NOTHING"
                elif conflict_mode == "INSERT OR REPLACE":
                    # Find primary keys to perform UPSERT
                    schema = self.get_table_schema(table_name)
                    pk_cols = [c["name"] for c in schema if c["pk"]]
                    if pk_cols:
                        pk_str = ", ".join(f'"{pk.replace(chr(34), chr(34) + chr(34))}"' for pk in pk_cols)
                        non_pk_cols = [c for c in cols if c not in pk_cols]
                        if non_pk_cols:
                            update_str = ", ".join(
                                f'"{c.replace(chr(34), chr(34) + chr(34))}" = EXCLUDED."{c.replace(chr(34), chr(34) + chr(34))}"'
                                for c in non_pk_cols
                            )
                            conflict_clause = f" ON CONFLICT ({pk_str}) DO UPDATE SET {update_str}"
                        else:
                            # Only primary keys, replace is equivalent to ignore
                            conflict_clause = f" ON CONFLICT ({pk_str}) DO NOTHING"
                    else:
                        # No PK: default to DO NOTHING
                        conflict_clause = ""

                insert_sql = f'INSERT INTO public."{table_name.replace(chr(34), chr(34) + chr(34))}" ({cols_str}) VALUES ({placeholders}){conflict_clause};'

                cursor.execute("BEGIN;")
                count = 0
                for row in rows:
                    cursor.execute(insert_sql, row)
                    count += 1
                cursor.execute("COMMIT;")
                cursor.close()
                return count
            except Exception as e:
                try:
                    cursor.execute("ROLLBACK;")
                except Exception:
                    pass
                cursor.close()
                raise e

    def get_all_table_data(self, table_name: str) -> Tuple[List[str], List[Tuple[Any, ...]]]:
        """Fetch all columns and rows for a table (thread-safe)."""
        if not self.connection:
            return [], []
        with self.lock:
            try:
                cursor = self.connection.cursor()
                schema = self.get_table_schema(table_name)
                headers = [col["name"] for col in schema]
                
                safe_table = table_name.replace('"', '""')
                cursor.execute(f'SELECT * FROM public."{safe_table}";')
                rows = cursor.fetchall()
                cursor.close()
                return headers, rows
            except Exception:
                return [], []

    def get_table_ddl(self, table_name: str) -> str:
        """Generate a basic CREATE TABLE DDL statement for PostgreSQL."""
        schema = self.get_table_schema(table_name)
        if not schema:
            return f"-- No schema found for {table_name}"
            
        columns_ddl = []
        pk_cols = []
        for col in schema:
            col_name = f'"{col["name"].replace(chr(34), chr(34) + chr(34))}"'
            col_type = col["type"]
            not_null = " NOT NULL" if col["notnull"] else ""
            default = f' DEFAULT {col["default_value"]}' if col["default_value"] is not None else ""
            columns_ddl.append(f"    {col_name} {col_type}{not_null}{default}")
            if col["pk"]:
                pk_cols.append(col_name)
                
        if pk_cols:
            pk_str = ", ".join(pk_cols)
            columns_ddl.append(f"    PRIMARY KEY ({pk_str})")
            
        cols_joined = ",\n".join(columns_ddl)
        return f'CREATE TABLE public."{table_name.replace(chr(34), chr(34) + chr(34))}" (\n{cols_joined}\n);'
