#!/bin/bash

# Immudb Inventory Management API - Startup Script

set -e

echo "🐳 Starting Immudb Inventory Management API..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
# API Configuration
API_KEY=supersecretapikey
NODE_ENV=development
PORT=3000

# Immudb Configuration
IMMUDB_HOST=immudb
IMMUDB_PORT=3322
IMMUDB_USER=immudb
IMMUDB_PASSWORD=immudb
EOF
fi

# Function to start services
start_services() {
    echo "🚀 Starting services..."
    docker-compose up -d
    
    echo "⏳ Waiting for services to be ready..."
    sleep 10
    
    # Check if API is responding
    echo "🔍 Checking API health..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/ > /dev/null 2>&1; then
            echo "✅ API is ready!"
            break
        fi
        echo "⏳ Waiting for API... ($i/30)"
        sleep 2
    done
    
    # Check if Immudb is responding
    echo "🔍 Checking Immudb health..."
    for i in {1..30}; do
        if curl -s http://localhost:8080/healthz > /dev/null 2>&1; then
            echo "✅ Immudb is ready!"
            break
        fi
        echo "⏳ Waiting for Immudb... ($i/30)"
        sleep 2
    done
}

# Function to show status
show_status() {
    echo ""
    echo "📊 Service Status:"
    docker-compose ps
    
    echo ""
    echo "🌐 Available Services:"
    echo "  • API: http://localhost:3000"
    echo "  • Immudb Console: http://localhost:8080"
    echo "  • API Key: supersecretapikey"
    
    echo ""
    echo "📋 Quick Test Commands:"
    echo "  • Health Check: curl http://localhost:3000/"
    echo "  • Create Product: curl -X POST http://localhost:3000/api/products -H 'Content-Type: application/json' -H 'X-API-Key: supersecretapikey' -d '{\"sku\":\"TEST-001\",\"name\":\"Test Product\",\"price\":99.99,\"quantity\":10}'"
    echo "  • Time Travel: curl -X GET 'http://localhost:3000/api/inventory/time-travel/TEST-001?timestamp=2025-10-12T15:00:00.000Z' -H 'X-API-Key: supersecretapikey'"
}

# Function to stop services
stop_services() {
    echo "🛑 Stopping services..."
    docker-compose down
    echo "✅ Services stopped."
}

# Function to show logs
show_logs() {
    echo "📋 Showing logs..."
    docker-compose logs -f
}

# Main script logic
case "${1:-start}" in
    start)
        start_services
        show_status
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        start_services
        show_status
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    clean)
        echo "🧹 Cleaning up..."
        docker-compose down -v
        docker system prune -f
        echo "✅ Cleanup complete."
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|clean}"
        echo ""
        echo "Commands:"
        echo "  start   - Start all services (default)"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        echo "  status  - Show service status"
        echo "  logs    - Show service logs"
        echo "  clean   - Stop services and clean up volumes"
        exit 1
        ;;
esac
