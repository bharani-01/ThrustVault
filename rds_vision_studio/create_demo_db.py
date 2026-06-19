import sqlite3
import random
from pathlib import Path

DB_FILE = Path(__file__).parent / "demo.db"

def create_demo_db():
    print(f"Creating demo database at {DB_FILE}...")
    
    # Remove existing demo DB
    if DB_FILE.exists():
        DB_FILE.unlink()

    conn = sqlite3.connect(str(DB_FILE))
    cursor = conn.cursor()

    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. Departments Table
    cursor.execute("""
        CREATE TABLE departments (
            dept_id INTEGER PRIMARY KEY AUTOINCREMENT,
            dept_name TEXT NOT NULL UNIQUE,
            budget REAL,
            office_location TEXT
        );
    """)

    # 2. Employees Table
    cursor.execute("""
        CREATE TABLE employees (
            emp_id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE,
            salary REAL,
            hire_date TEXT DEFAULT CURRENT_DATE,
            department_id INTEGER,
            notes TEXT,
            FOREIGN KEY (department_id) REFERENCES departments(dept_id)
        );
    """)

    # Index on employee email and last name
    cursor.execute("CREATE INDEX idx_emp_email ON employees(email);")
    cursor.execute("CREATE INDEX idx_emp_last_first ON employees(last_name, first_name);")

    # 3. Projects Table
    cursor.execute("""
        CREATE TABLE projects (
            proj_id INTEGER PRIMARY KEY AUTOINCREMENT,
            proj_name TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT,
            lead_emp_id INTEGER,
            FOREIGN KEY (lead_emp_id) REFERENCES employees(emp_id)
        );
    """)

    # Insert Department records
    depts = [
        ("Engineering", 1500000.0, "Building A - Room 301"),
        ("Product Management", 500000.0, "Building A - Room 305"),
        ("Design", 400000.0, "Building B - Room 102"),
        ("Marketing", 750000.0, "Building C - Room 204"),
        ("Finance", 1200000.0, "Building C - Room 201"),
        ("Human Resources", 300000.0, "Building A - Room 101")
    ]
    cursor.executemany(
        "INSERT INTO departments (dept_name, budget, office_location) VALUES (?, ?, ?);",
        depts
    )
    conn.commit()

    # Get department IDs
    cursor.execute("SELECT dept_id FROM departments;")
    dept_ids = [row[0] for row in cursor.fetchall()]

    # Insert 150 Employees for pagination verification
    first_names = ["John", "Jane", "Alice", "Bob", "Charlie", "David", "Emily", "Frank", "Grace", "Henry", 
                   "Ivy", "Jack", "Kate", "Liam", "Mia", "Noah", "Olivia", "Peter", "Quinn", "Rachel", 
                   "Sam", "Tina", "Ursula", "Victor", "Walter", "Xavier", "Yvonne", "Zachary"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Garcia", "Rodriguez", 
                  "Wilson", "Martinez", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore", "Martin", 
                  "Jackson", "Thompson", "White", "Lopez", "Lee", "Gonzalez", "Harris", "Clark", "Lewis"]

    employees = []
    for i in range(1, 151):
        fn = random.choice(first_names)
        ln = random.choice(last_names)
        email = f"{fn.lower()}.{ln.lower()}.{i}@enterprise.com"
        salary = round(random.uniform(45000.0, 160000.0), 2)
        dept_id = random.choice(dept_ids) if random.random() > 0.05 else None # some nulls
        notes = f"Employee #{i} notes. Special skills: " + ", ".join(random.sample(["Python", "SQL", "React", "Docker", "AWS", "Git", "Kotlin", "Swift"], 3))
        
        # Random dates
        year = random.randint(2015, 2026)
        month = random.randint(1, 12)
        day = random.randint(1, 28)
        hire_date = f"{year:04d}-{month:02d}-{day:02d}"
        
        employees.append((fn, ln, email, salary, hire_date, dept_id, notes))

    cursor.executemany(
        "INSERT INTO employees (first_name, last_name, email, salary, hire_date, department_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?);",
        employees
    )
    conn.commit()

    # Get employee IDs
    cursor.execute("SELECT emp_id FROM employees;")
    emp_ids = [row[0] for row in cursor.fetchall()]

    # Insert Projects
    projects = [
        ("Database Viewer Pro", "2026-01-01", "2026-06-30", random.choice(emp_ids)),
        ("Vanguard Frontend Migration", "2025-05-10", "2026-04-15", random.choice(emp_ids)),
        ("NextGen API Framework", "2026-02-15", None, random.choice(emp_ids)), # project without end date
        ("Marketing Campaign Q3", "2026-07-01", "2026-09-30", random.choice(emp_ids)),
        ("Cloud Infrastructure Audit", "2025-11-01", "2026-01-15", random.choice(emp_ids))
    ]
    cursor.executemany(
        "INSERT INTO projects (proj_name, start_date, end_date, lead_emp_id) VALUES (?, ?, ?, ?);",
        projects
    )
    conn.commit()

    # Create a View for testing views
    cursor.execute("""
        CREATE VIEW employee_details_view AS
        SELECT 
            e.emp_id, 
            e.first_name || ' ' || e.last_name AS full_name, 
            e.email, 
            d.dept_name, 
            d.office_location, 
            e.salary
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.dept_id;
    """)
    conn.commit()

    print("Demo database populated successfully!")
    conn.close()

if __name__ == "__main__":
    create_demo_db()
