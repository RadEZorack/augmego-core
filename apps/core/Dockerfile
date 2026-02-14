# Use official Bun image
FROM oven/bun:1.1

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Expose port (DO injects PORT)
EXPOSE 8080

# Start server
CMD ["bun", "run", "start"]
