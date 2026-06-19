import sqlite3
import random
import datetime
from pathlib import Path

DB_FILE = Path(__file__).parent / "complex_testing.db"

def create_complex_db():
    print(f"Instantiating complex testing database at: {DB_FILE}...")
    
    if DB_FILE.exists():
        try:
            DB_FILE.unlink()
        except Exception as e:
            print(f"Warning: Could not remove existing file: {e}")

    conn = sqlite3.connect(str(DB_FILE))
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. Categories Table
    cursor.execute("""
        CREATE TABLE categories (
            category_id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_name TEXT NOT NULL UNIQUE,
            description TEXT
        );
    """)

    # 2. Products Table
    cursor.execute("""
        CREATE TABLE products (
            product_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            category_id INTEGER,
            price REAL NOT NULL,
            stock_quantity INTEGER NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories(category_id)
        );
    """)

    # 3. Customers Table
    cursor.execute("""
        CREATE TABLE customers (
            customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            country TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_DATE
        );
    """)
    cursor.execute("CREATE INDEX idx_customer_email ON customers(email);")
    cursor.execute("CREATE INDEX idx_customer_names ON customers(last_name, first_name);")

    # 4. Orders Table
    cursor.execute("""
        CREATE TABLE orders (
            order_id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            order_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Pending', 'Shipped', 'Delivered', 'Cancelled')),
            total_amount REAL DEFAULT 0.0,
            FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        );
    """)
    cursor.execute("CREATE INDEX idx_orders_customer ON orders(customer_id);")
    cursor.execute("CREATE INDEX idx_orders_date ON orders(order_date);")

    # 5. Order Items Table
    cursor.execute("""
        CREATE TABLE order_items (
            item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL CHECK(quantity > 0),
            unit_price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(product_id)
        );
    """)
    cursor.execute("CREATE INDEX idx_items_order ON order_items(order_id);")

    # 6. Reviews Table
    cursor.execute("""
        CREATE TABLE reviews (
            review_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            customer_id INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
            comment TEXT,
            review_date TEXT DEFAULT CURRENT_DATE,
            FOREIGN KEY (product_id) REFERENCES products(product_id),
            FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        );
    """)

    # Insert Categories (10 records)
    cats = [
        ("Electronics", "Gadgets, devices, hardware, and components"),
        ("Apparel & Clothing", "Trendy fashion garments and accessories"),
        ("Home & Kitchen", "Appliances, furniture, decor, and tools"),
        ("Books & Ebooks", "Fiction, reference, education, and children literature"),
        ("Beauty & Cosmetics", "Skin care products, makeup, and perfumes"),
        ("Sports & Outdoors", "Athletic gear, camping, cycling, and fitness equipment"),
        ("Toys & Hobbies", "Board games, action figures, crafts, and educational toys"),
        ("Automotive", "Car accessories, spare parts, and tools"),
        ("Groceries", "Organic food items, snacks, drinks, and ingredients"),
        ("Office Supplies", "Stationery, printers, paper, and organizers")
    ]
    cursor.executemany("INSERT INTO categories (category_name, description) VALUES (?, ?);", cats)
    conn.commit()
    
    # Get Category IDs
    cursor.execute("SELECT category_id FROM categories;")
    cat_ids = [r[0] for r in cursor.fetchall()]

    # Insert Products (200 records)
    prod_names = {
        1: ["Smartphone Alpha", "Laptop Pro 15", "Wireless Earbuds", "Smartwatch Elite", "Bluetooth Speaker", "Gaming Console X", "4K Smart TV", "VR Headset Nano"],
        2: ["Classic Blue Jeans", "Wool Winter Coat", "Graphic Cotton T-Shirt", "Leather Boots", "Silk Scarf", "Running Sneakers", "Athletic Socks", "Sun Hat"],
        3: ["Air Fryer Deluxe", "Espresso Maker", "Non-Stick Frying Pan", "Robot Vacuum Cleaner", "Memory Foam Pillow", "LED Floor Lamp", "Ceramic Dinnerware Set"],
        4: ["Mystery of the Clocktower", "Introduction to Python", "The Infinite Cosmos", "History of Civilizations", "Healthy Eating Recipes", "Leadership Rules"],
        5: ["Hydrating Moisturizer", "Organic Aloe Vera Gel", "Matte Lipstick Red", "Scented Body Wash", "Vitamin C Face Serum", "Charcoal Face Mask"],
        6: ["Yoga Mat Premium", "Waterproof Tent 4-Person", "Aluminum Water Bottle", "Dumbbell Set 20lb", "Mountain Bicycle", "Hiking Backpack 50L"],
        7: ["Building Blocks Set", "Remote Control Car", "Strategy Board Game", "Watercolor Paint Kit", "Plush Teddy Bear", "Dinosaur Action Figure"],
        8: ["All-Weather Floor Mats", "Car Phone Mount", "Dashboard Camera", "Portable Tire Inflator", "Synthetic Engine Oil", "Leather Cleaner Spray"],
        9: ["Organic Green Tea", "Premium Coffee Beans", "Whole Wheat Crackers", "Roasted Almonds Pack", "Dark Chocolate Bar", "Extra Virgin Olive Oil"],
        10: ["Gel Pen Multipack", "Grid Spiral Notebook", "Ergonomic Desk Chair", "Dry Erase Whiteboard", "Sticky Notes Cube", "Wireless Laser Pointer"]
    }
    
    prods = []
    for c_id in cat_ids:
        names = prod_names[c_id]
        for name in names:
            # Generate 20 items per category to hit ~200 products total
            for suffix in ["", " V2", " Lite", " Plus", " Ultra"]:
                p_name = f"{name}{suffix}"
                price = round(random.uniform(5.99, 1499.99), 2)
                stock = random.randint(10, 500)
                prods.append((p_name, c_id, price, stock))
    cursor.executemany("INSERT INTO products (product_name, category_id, price, stock_quantity) VALUES (?, ?, ?, ?);", prods)
    conn.commit()

    # Get Product IDs and prices
    cursor.execute("SELECT product_id, price FROM products;")
    prod_info = cursor.fetchall()
    prod_ids = [p[0] for p in prod_info]
    prod_prices = {p[0]: p[1] for p in prod_info}

    # Insert Customers (1,500 records)
    first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", 
                   "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
                   "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
                   "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
                  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
                  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
                  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker"]
    countries = ["United States", "Canada", "United Kingdom", "Germany", "France", "Australia", 
                 "Japan", "Brazil", "India", "South Africa"]
                 
    custs = []
    for idx in range(1, 1501):
        fn = random.choice(first_names)
        ln = random.choice(last_names)
        email = f"{fn.lower()}.{ln.lower()}.{idx}@testingdb.org"
        phone = f"+1-{random.randint(200,999)}-555-{random.randint(1000,9995)}"
        country = random.choice(countries)
        year = random.randint(2020, 2025)
        month = random.randint(1, 12)
        day = random.randint(1, 28)
        created_at = f"{year:04d}-{month:02d}-{day:02d}"
        custs.append((fn, ln, email, phone, country, created_at))
    cursor.executemany("INSERT INTO customers (first_name, last_name, email, phone, country, created_at) VALUES (?, ?, ?, ?, ?, ?);", custs)
    conn.commit()

    # Get Customer IDs
    cursor.execute("SELECT customer_id FROM customers;")
    cust_ids = [r[0] for r in cursor.fetchall()]

    # Insert Orders (3,000 records)
    orders = []
    statuses = ["Pending", "Shipped", "Delivered", "Cancelled"]
    for idx in range(1, 3001):
        c_id = random.choice(cust_ids)
        year = random.randint(2024, 2026)
        month = random.randint(1, 12)
        day = random.randint(1, 28)
        order_date = f"{year:04d}-{month:02d}-{day:02d}"
        status = random.choice(statuses)
        orders.append((c_id, order_date, status))
    cursor.executemany("INSERT INTO orders (customer_id, order_date, status) VALUES (?, ?, ?);", orders)
    conn.commit()

    # Get Order IDs
    cursor.execute("SELECT order_id FROM orders;")
    order_ids = [r[0] for r in cursor.fetchall()]

    # Insert Order Items (6,000 records)
    # Distribute items among orders
    order_items = []
    for order_id in order_ids:
        # Every order gets 1 to 3 items
        items_count = random.randint(1, 3)
        selected_prods = random.sample(prod_ids, items_count)
        for p_id in selected_prods:
            qty = random.randint(1, 5)
            price = prod_prices[p_id]
            order_items.append((order_id, p_id, qty, price))
    cursor.executemany("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?);", order_items)
    conn.commit()

    # Update Order total amounts matching the sum of items
    cursor.execute("""
        UPDATE orders
        SET total_amount = (
            SELECT COALESCE(SUM(quantity * unit_price), 0)
            FROM order_items
            WHERE order_items.order_id = orders.order_id
        );
    """)
    conn.commit()

    # Insert Reviews (1,000 records)
    reviews = []
    comments = [
        "Absolutely love it! Exceeded my expectations.",
        "Decent product for the price. Works as advertised.",
        "Terrible experience. Broke on the second day.",
        "Good build quality but slow shipping.",
        "Highly recommended! Will definitely buy again.",
        "Average performance. Nothing special.",
        "Useful product but instruction manual is missing.",
        "Great customer support and high-quality item.",
        "Satisfied with this purchase.",
        "Poor quality material. Do not recommend."
    ]
    for _ in range(1000):
        p_id = random.choice(prod_ids)
        c_id = random.choice(cust_ids)
        rating = random.randint(1, 5)
        # Select comment matching rating bias
        if rating >= 4:
            comment = random.choice([comments[0], comments[4], comments[7], comments[8]])
        elif rating <= 2:
            comment = random.choice([comments[2], comments[9]])
        else:
            comment = random.choice([comments[1], comments[3], comments[5], comments[6]])
            
        year = random.randint(2025, 2026)
        month = random.randint(1, 12)
        day = random.randint(1, 28)
        review_date = f"{year:04d}-{month:02d}-{day:02d}"
        reviews.append((p_id, c_id, rating, comment, review_date))
    cursor.executemany("INSERT INTO reviews (product_id, customer_id, rating, comment, review_date) VALUES (?, ?, ?, ?, ?);", reviews)
    conn.commit()

    # Print summary of generated rows
    print("\n--- Testing Database Generated successfully! ---")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r[0] for r in cursor.fetchall()]
    total_count = 0
    for t in tables:
        cursor.execute(f"SELECT COUNT(*) FROM \"{t}\";")
        count = cursor.fetchone()[0]
        print(f"Table: {t:15} | Row count: {count:,}")
        total_count += count
    print(f"Total Database Record Count: {total_count:,} rows")
    
    conn.close()

if __name__ == "__main__":
    create_complex_db()
