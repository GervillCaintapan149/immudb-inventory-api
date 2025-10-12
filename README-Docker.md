# 🐳 Immudb Inventory Management API - Docker Setup

This Docker Compose setup provides a complete environment for running the Immudb Inventory Management API with all dependencies.

## 🚀 Quick Start

### Prerequisites
- Docker Desktop or Docker Engine
- Docker Compose

### 1. Start the Services
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Start specific service
docker-compose up -d immudb
docker-compose up -d api
```

### 2. Stop the Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: This will delete all data)
docker-compose down -v
```

## 📋 Services

### Immudb Database
- **Container:** `immudb-inventory`
- **Ports:** 
  - `3322` - gRPC API
  - `8080` - Web Console
- **Web Console:** http://localhost:8080
- **Data Volume:** `immudb_data`

### API Service
- **Container:** `immudb-api`
- **Port:** `3000`
- **API Base URL:** http://localhost:3000
- **Health Check:** http://localhost:3000/

## 🔧 Configuration

### Environment Variables
The following environment variables can be customized in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - IMMUDB_HOST=immudb
  - IMMUDB_PORT=3322
  - IMMUDB_USER=immudb
  - IMMUDB_PASSWORD=immudb
  - API_KEY=supersecretapikey
```

### API Key
Default API key is `supersecretapikey`. Change it in the environment variables for production.

## 🧪 Testing the API

### Health Check
```bash
curl http://localhost:3000/
```

### Create Product
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "X-API-Key: supersecretapikey" \
  -d '{
    "sku": "DOCKER-001",
    "name": "Docker Test Product",
    "description": "Product created via Docker",
    "price": 99.99,
    "quantity": 10,
    "category": "Test",
    "supplier": "Docker Inc"
  }'
```

### Time Travel Query
```bash
curl -X GET "http://localhost:3000/api/inventory/time-travel/DOCKER-001?timestamp=2025-10-12T15:00:00.000Z" \
  -H "X-API-Key: supersecretapikey"
```

## 📊 Monitoring

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f immudb

# Last 100 lines
docker-compose logs --tail=100 api
```

### Container Status
```bash
# Check running containers
docker-compose ps

# Check resource usage
docker stats
```

### Health Checks
```bash
# Check API health
curl http://localhost:3000/

# Check Immudb health
curl http://localhost:8080/healthz
```

## 🔄 Development Mode

For development with live code changes:

```bash
# Start with volume mounting for live reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Create `docker-compose.dev.yml`:
```yaml
version: '3.8'
services:
  api:
    volumes:
      - ./src:/app/src
      - ./server.js:/app/server.js
    command: ["npm", "run", "dev"]  # If you have a dev script
```

## 🗄️ Data Persistence

### Immudb Data
- **Volume:** `immudb_data`
- **Location:** Docker managed volume
- **Persistence:** Data survives container restarts

### Backup Data
```bash
# Create backup
docker run --rm -v immudb-shopinventory_immudb_data:/data -v $(pwd):/backup alpine tar czf /backup/immudb-backup.tar.gz -C /data .

# Restore backup
docker run --rm -v immudb-shopinventory_immudb_data:/data -v $(pwd):/backup alpine tar xzf /backup/immudb-backup.tar.gz -C /data
```

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   lsof -i :3000
   lsof -i :3322
   
   # Kill the process or change ports in docker-compose.yml
   ```

2. **Container Won't Start**
   ```bash
   # Check logs
   docker-compose logs api
   
   # Rebuild container
   docker-compose build --no-cache api
   ```

3. **Database Connection Issues**
   ```bash
   # Check if Immudb is ready
   docker-compose logs immudb
   
   # Wait for health check
   docker-compose ps
   ```

### Reset Everything
```bash
# Stop and remove everything
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

## 📈 Production Considerations

1. **Security**
   - Change default API key
   - Use secrets management
   - Enable TLS/SSL

2. **Performance**
   - Adjust resource limits
   - Use production Node.js image
   - Configure Immudb for production

3. **Monitoring**
   - Add logging aggregation
   - Set up health monitoring
   - Configure alerts

## 🔗 Useful Commands

```bash
# Execute commands in running container
docker-compose exec api sh
docker-compose exec immudb sh

# View container details
docker inspect immudb-inventory
docker inspect immudb-api

# Restart specific service
docker-compose restart api

# Scale API service (if needed)
docker-compose up -d --scale api=3
```

## 📚 API Documentation

Once running, the API is available at:
- **Base URL:** http://localhost:3000
- **API Key:** `supersecretapikey`
- **Immudb Console:** http://localhost:8080

See the main README for complete API documentation.
