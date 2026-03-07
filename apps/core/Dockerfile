# Use official Bun image
FROM oven/bun:1.3

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy Prisma schema first (for layer caching)
COPY prisma ./prisma

# Generate Prisma client at build time.
RUN bun run db:generate

# Copy source
COPY . .

# Expose port (DO injects PORT)
EXPOSE 8080

# Start server
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
