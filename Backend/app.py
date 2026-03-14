from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import psycopg2
import face_recognition
import numpy as np
import os
import uuid
import hashlib
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ---------------- DATABASE ----------------

def get_db_connection():
    return psycopg2.connect(
        host="localhost",
        database="doorbell_db",
        user="postgres",
        password="tiger"
    )

# ---------------- DATABASE SETUP ----------------
# Run this once to create the users table.
# You can also run the SQL manually in psql:
#
#   CREATE TABLE IF NOT EXISTS users (
#       id         SERIAL PRIMARY KEY,
#       name       VARCHAR(255) NOT NULL,
#       email      VARCHAR(255) UNIQUE NOT NULL,
#       phone      VARCHAR(50),
#       password   VARCHAR(255) NOT NULL,
#       created_at TIMESTAMP DEFAULT NOW()
#   );

def hash_password(password):
    """SHA-256 hash a password (plain — swap for bcrypt in production)."""
    return hashlib.sha256(password.encode()).hexdigest()


# ---------------- FOLDERS ----------------

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
IMAGE_DIR = os.path.join(BASE_DIR, "visitor_images")

os.makedirs(IMAGE_DIR, exist_ok=True)


# ---------------- IMAGE SERVING ----------------

@app.route("/images/<filename>")
def serve_image(filename):
    return send_from_directory(IMAGE_DIR, filename)


# ---------------- BASIC ----------------

@app.route("/")
def home():
    return "Smart IoT Doorbell Backend Running"


# ================================================================
#  AUTHENTICATION ROUTES
# ================================================================

@app.route("/signup", methods=["POST"])
def signup():
    data = request.json or {}
    name     = (data.get("name") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    phone    = (data.get("phone") or "").strip()
    password = (data.get("password") or "")

    if not name or not email or not password:
        return jsonify({"status": "error", "message": "Name, email and password are required"}), 400

    conn = get_db_connection()
    cur  = conn.cursor()

    # Check for existing email
    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    if cur.fetchone():
        cur.close()
        conn.close()
        return jsonify({"status": "error", "message": "An account with this email already exists"}), 409

    hashed = hash_password(password)

    cur.execute(
        """
        INSERT INTO users (name, email, phone, password)
        VALUES (%s, %s, %s, %s)
        RETURNING id, name, email, phone, created_at
        """,
        (name, email, phone, hashed)
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "status": "success",
        "user": {
            "id":    row[0],
            "name":  row[1],
            "email": row[2],
            "phone": row[3] or "",
            "created_at": row[4].isoformat() if row[4] else None
        }
    }), 201


@app.route("/login", methods=["POST"])
def login():
    data     = request.json or {}
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "")

    if not email or not password:
        return jsonify({"status": "error", "message": "Email and password are required"}), 400

    hashed = hash_password(password)

    conn = get_db_connection()
    cur  = conn.cursor()

    cur.execute(
        "SELECT id, name, email, phone FROM users WHERE email = %s AND password = %s",
        (email, hashed)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return jsonify({"status": "error", "message": "Invalid email or password"}), 401

    return jsonify({
        "status": "success",
        "user": {
            "id":    row[0],
            "name":  row[1],
            "email": row[2],
            "phone": row[3] or ""
        }
    })


@app.route("/user/<int:user_id>", methods=["GET"])
def get_user(user_id):
    conn = get_db_connection()
    cur  = conn.cursor()

    cur.execute(
        "SELECT id, name, email, phone FROM users WHERE id = %s",
        (user_id,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return jsonify({"status": "error", "message": "User not found"}), 404

    return jsonify({
        "status": "success",
        "user": {
            "id":    row[0],
            "name":  row[1],
            "email": row[2],
            "phone": row[3] or ""
        }
    })


@app.route("/user/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    data  = request.json or {}
    name  = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()

    if not name:
        return jsonify({"status": "error", "message": "Name is required"}), 400

    conn = get_db_connection()
    cur  = conn.cursor()

    cur.execute(
        "UPDATE users SET name = %s, phone = %s WHERE id = %s RETURNING id, name, email, phone",
        (name, phone, user_id)
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not row:
        return jsonify({"status": "error", "message": "User not found"}), 404

    return jsonify({
        "status": "success",
        "user": {
            "id":    row[0],
            "name":  row[1],
            "email": row[2],
            "phone": row[3] or ""
        }
    })


# ================================================================
#  FACE RECOGNITION  (unchanged)
# ================================================================

@app.route("/recognize", methods=["POST"])
def recognize():

    image = request.files.get("image")

    if not image:
        return jsonify({"status": "fail", "message": "No image uploaded"}), 400

    filename = f"{uuid.uuid4().hex}.jpg"
    image_path = os.path.join(IMAGE_DIR, filename)
    image.save(image_path)

    img = face_recognition.load_image_file(image_path)
    encodings = face_recognition.face_encodings(img)

    if len(encodings) == 0:
        os.remove(image_path)
        return jsonify({"status": "fail", "message": "No face detected"}), 400

    unknown_encoding = encodings[0]

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id, encoding FROM visitors")
    rows = cur.fetchall()

    known_encodings = []
    known_ids = []

    for vid, enc in rows:
        if enc:
            known_encodings.append(np.frombuffer(enc, dtype=np.float64))
            known_ids.append(vid)

    visitor_id = None

    if known_encodings:

        matches = face_recognition.compare_faces(
            known_encodings,
            unknown_encoding,
            tolerance=0.4
        )

        for i, match in enumerate(matches):
            if match:
                visitor_id = known_ids[i]
                break

    now = datetime.now()

    if visitor_id:

        cur.execute("SELECT visitor_name, visitor_type FROM visitors WHERE id = %s", (visitor_id,))
        name, visitor_type = cur.fetchone()

        cur.execute("""
        INSERT INTO visits (visitor_id, image_name, visit_time)
        VALUES (%s, %s, %s)
        """, (visitor_id, filename, now))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "status": "known",
            "visitor_id": visitor_id,
            "name": name,
            "type": visitor_type
        })

    encoding_bytes = unknown_encoding.tobytes()

    cur.execute("""
    INSERT INTO visitors (visitor_name, visitor_type, encoding)
    VALUES (%s, %s, %s)
    RETURNING id
    """, ("Unknown Visitor", "Unknown", encoding_bytes))

    visitor_id = cur.fetchone()[0]

    cur.execute("""
    INSERT INTO visits (visitor_id, image_name, visit_time)
    VALUES (%s, %s, %s)
    """, (visitor_id, filename, now))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "status": "unknown",
        "visitor_id": visitor_id,
        "name": "Unknown Visitor",
        "type": "Unknown"
    })


# ================================================================
#  DASHBOARD DATA  (unchanged)
# ================================================================

@app.route("/visitors")
def get_visitors():

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
    SELECT
        v.id,
        v.visitor_name,
        v.visitor_type,
        MAX(vi.visit_time),
        COUNT(vi.id),
        MAX(vi.image_name)
    FROM visitors v
    LEFT JOIN visits vi
    ON v.id = vi.visitor_id
    GROUP BY v.id
    ORDER BY MAX(vi.visit_time) DESC
    """)

    rows = cur.fetchall()
    cur.close()
    conn.close()

    visitors = []
    for r in rows:
        visitors.append({
            "id":     r[0],
            "name":   r[1],
            "type":   r[2],
            "time":   r[3].strftime("%Y-%m-%d %H:%M:%S") if r[3] else None,
            "visits": r[4],
            "image":  r[5]
        })

    return jsonify(visitors)


# ================================================================
#  VISITOR PROFILE  (unchanged)
# ================================================================

@app.route("/visitor/<int:visitor_id>")
def visitor_history(visitor_id):

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
    SELECT image_name, visit_time
    FROM visits
    WHERE visitor_id=%s
    ORDER BY visit_time DESC
    """, (visitor_id,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    history = []
    for r in rows:
        history.append({
            "image": r[0],
            "time":  r[1].strftime("%Y-%m-%d %H:%M:%S")
        })

    return jsonify(history)


# ================================================================
#  UPDATE / DELETE VISITOR  (unchanged)
# ================================================================

@app.route("/update_visitor", methods=["POST"])
def update_visitor():
    data = request.json
    visitor_id = data["visitor_id"]
    name = data["name"]

    conn = get_db_connection()
    cur = conn.cursor()

    if name and name.strip() and name.strip().lower() != 'unknown visitor':
        cur.execute("""
        UPDATE visitors
        SET visitor_name=%s,
            visitor_type='Known'
        WHERE id=%s
        """, (name, visitor_id))
    else:
        cur.execute("""
        UPDATE visitors
        SET visitor_name=%s
        WHERE id=%s
        """, (name or 'Unknown Visitor', visitor_id))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"status": "success"})


@app.route("/delete_visitor/<int:visitor_id>", methods=["DELETE"])
def delete_visitor(visitor_id):

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("DELETE FROM visits WHERE visitor_id=%s", (visitor_id,))
    cur.execute("DELETE FROM visitors WHERE id=%s", (visitor_id,))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"status": "deleted"})


# ================================================================
#  RUN
# ================================================================

if __name__ == "__main__":
    app.run(debug=True)
