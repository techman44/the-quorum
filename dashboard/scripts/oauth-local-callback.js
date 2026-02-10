#!/usr/bin/env node

/**
 * Quorum Dashboard - Local OAuth Callback Server
 *
 * Run this locally to handle OpenAI OAuth callbacks when using the remote dashboard.
 *
 * Usage:
 *   node scripts/oauth-local-callback.js
 *
 * Then in a separate terminal, set up SSH forwarding:
 *   ssh -L 1455:localhost:1455 root@192.168.20.36 -N
 */

const http = require('http');
const { URL } = require('url');

const PORT = 1455;
const DASHBOARD_API = process.env.DASHBOARD_API || 'http://192.168.20.36:3000';

console.log('=================================');
console.log('  Quorum OAuth Callback Server  ');
console.log('=================================');
console.log('');
console.log('Dashboard API:', DASHBOARD_API);
console.log('Listening on: http://127.0.0.1:' + PORT);
console.log('');
console.log('Make sure SSH forwarding is active:');
console.log('  ssh -L 1455:localhost:1455 root@192.168.20.36 -N');
console.log('');
console.log('Press Ctrl+C to stop');
console.log('=================================');
console.log('');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: PORT }));
    return;
  }

  if (req.url.startsWith('/auth/callback')) {
    const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e53e3e;">Authentication Error</h1>
          <p>Error: ${error}</p>
          <p>${url.searchParams.get('error_description') || ''}</p>
          <p>You can close this window and try again.</p>
        </body>
        </html>
      `);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid Callback</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e53e3e;">Invalid Callback</h1>
          <p>No authorization code received.</p>
        </body>
        </html>
      `);
      return;
    }

    console.log('Received authorization code, forwarding to dashboard...');

    // Forward the code to the dashboard API
    fetch(`${DASHBOARD_API}/api/auth/openai/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          console.log('✓ Authentication successful!');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Authentication Successful</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #38a169;">✓ Authentication Successful!</h1>
              <p>Your OpenAI account has been connected to the Quorum Dashboard.</p>
              <p>You can close this window and refresh the dashboard.</p>
              <script>
                setTimeout(() => {
                  window.close();
                  if (!window.closed) {
                    document.body.innerHTML += '<p><small>(Window close was blocked - you can close it manually)</small></p>';
                  }
                }, 2000);
              </script>
            </body>
            </html>
          `);
        } else {
          console.error('Authentication failed:', data.error);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Authentication Failed</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #e53e3e;">Authentication Failed</h1>
              <p>${data.error || 'Unknown error'}</p>
              <p>Please try again.</p>
            </body>
            </html>
          `);
        }
      })
      .catch((err) => {
        console.error('Error forwarding to dashboard API:', err);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Server Error</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #e53e3e;">Server Error</h1>
            <p>Could not communicate with the dashboard at ${DASHBOARD_API}</p>
            <p>Make sure the dashboard is running.</p>
            <p>Error: ${err.message}</p>
          </body>
          </html>
        `);
      });
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('✓ Server listening on 127.0.0.1:' + PORT);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  server.close(() => {
    process.exit(0);
  });
});
