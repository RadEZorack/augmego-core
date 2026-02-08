import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () => `
    <h1>Augmego</h1>
    <a href="/login">Sign in</a>
  `)
  .get("/dashboard", async () => `
    <h1>Dashboard</h1>
    <pre id="status"></pre>
    <script>
      fetch('/api/v1/health')
        .then(r => r.json())
        .then(d => {
          document.getElementById('status').textContent =
            JSON.stringify(d, null, 2)
        })
    </script>
  `)
  .listen(3001);

console.log("Web UI running on http://localhost:3001");
