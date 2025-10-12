#!/bin/bash

# Immudb Inventory API - Test Runner Script

set -e

echo "🧪 Immudb Inventory API Test Runner"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# Install test dependencies
print_status "Installing test dependencies..."
npm install --save-dev jest supertest nodemon

# Check if server is running
check_server() {
    print_status "Checking if server is running..."
    if curl -s http://localhost:3000/ > /dev/null 2>&1; then
        print_success "Server is running"
        return 0
    else
        print_warning "Server is not running. Starting server..."
        return 1
    fi
}

# Start server if not running
start_server() {
    print_status "Starting server in background..."
    node server.js &
    SERVER_PID=$!
    
    # Wait for server to start
    print_status "Waiting for server to start..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/ > /dev/null 2>&1; then
            print_success "Server started successfully (PID: $SERVER_PID)"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    print_error "Server failed to start within 30 seconds"
    return 1
}

# Stop server
stop_server() {
    if [ ! -z "$SERVER_PID" ]; then
        print_status "Stopping server (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
        print_success "Server stopped"
    fi
}

# Run tests
run_tests() {
    local test_type=$1
    
    case $test_type in
        "all")
            print_status "Running all tests..."
            npm test
            ;;
        "api")
            print_status "Running API tests..."
            npm run test:api
            ;;
        "watch")
            print_status "Running tests in watch mode..."
            npm run test:watch
            ;;
        "coverage")
            print_status "Running tests with coverage..."
            npm run test:coverage
            ;;
        *)
            print_error "Invalid test type: $test_type"
            print_status "Available options: all, api, watch, coverage"
            exit 1
            ;;
    esac
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    stop_server
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    local test_type=${1:-"all"}
    local start_server_flag=${2:-"true"}
    
    print_status "Test type: $test_type"
    print_status "Auto-start server: $start_server_flag"
    
    # Check if server is running
    if ! check_server; then
        if [ "$start_server_flag" = "true" ]; then
            if ! start_server; then
                print_error "Failed to start server. Exiting."
                exit 1
            fi
        else
            print_error "Server is not running and auto-start is disabled. Exiting."
            exit 1
        fi
    fi
    
    # Run tests
    if run_tests "$test_type"; then
        print_success "All tests passed! 🎉"
    else
        print_error "Some tests failed! ❌"
        exit 1
    fi
    
    # Cleanup
    cleanup
}

# Show usage
show_usage() {
    echo "Usage: $0 [test_type] [start_server]"
    echo ""
    echo "Test Types:"
    echo "  all       - Run all tests (default)"
    echo "  api       - Run only API tests"
    echo "  watch     - Run tests in watch mode"
    echo "  coverage  - Run tests with coverage report"
    echo ""
    echo "Start Server:"
    echo "  true      - Auto-start server if not running (default)"
    echo "  false     - Don't start server, assume it's running"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all tests with auto-start"
    echo "  $0 api false         # Run API tests, don't start server"
    echo "  $0 coverage true     # Run coverage tests with auto-start"
    echo "  $0 watch false       # Run in watch mode, don't start server"
}

# Handle command line arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_usage
    exit 0
fi

# Run main function
main "$@"
