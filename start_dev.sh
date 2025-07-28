#!/bin/bash

echo "================================="
echo "    KeyVPN System Startup"
echo "================================="

echo ""
echo "Starting Backend Server..."
cd backend
gnome-terminal --title="KeyVPN Backend" -- bash -c "npm run dev; exec bash" &

echo ""
echo "Waiting 3 seconds for backend to start..."
sleep 3

echo ""
echo "Starting Frontend..."
cd ..
gnome-terminal --title="KeyVPN Frontend" -- bash -c "npm run dev; exec bash" &

echo ""
echo "================================="
echo "Both servers are starting..."
echo "Backend: http://localhost:5000"
echo "Frontend: http://localhost:5173"
echo "================================="
