# Visitor-Recognition-and-Logging-System
 Visitor recognition system that captures images using a laptop camera, performs face recognition, records visitor voice messages via microphone, and logs visit details using a Flask backend and PostgreSQL database.
# Visitor Recognition System

## Overview

This project is an AI-based visitor recognition and logging system.
It captures visitor images using a laptop camera, performs face recognition, records voice messages using a microphone, and stores visit details in a database.

The system simulates a smart doorbell environment without requiring dedicated IoT hardware.

## Features

* Face recognition using a laptop camera
* Visitor image capture
* Voice message recording through microphone
* Visitor database management
* Visit history logging
* Flask backend API
* PostgreSQL database integration
* Web-based dashboard interface

## Technologies Used

* Python
* Flask
* JavaScript
* HTML / CSS
* OpenCV
* Face Recognition Library
* PostgreSQL

## Project Structure

backend/

* app.py
* face recognition logic
* database connection

frontend/

* index.html
* dashboard
* JavaScript interface

database/

* visitors table
* visits table

## How It Works

1. A visitor interacts with the system.
2. The laptop camera captures the visitor's image.
3. Face recognition checks if the visitor is known.
4. The visitor can record a voice message.
5. Visitor details and visit logs are stored in the database.
6. The dashboard shows visit history and visitor data.
