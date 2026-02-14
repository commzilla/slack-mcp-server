module.exports = {
  apps: [
    {
      name: "slack-listener",
      script: "./build/daemon.js",
      node_args: "--experimental-vm-modules",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      // Log files
      error_file: "./logs/daemon-error.log",
      out_file: "./logs/daemon-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Merge stdout and stderr into one log
      merge_logs: true,
    },
    {
      name: "slack-web",
      script: "./build/web.js",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: "production",
        WEB_PORT: "3456",
      },
      error_file: "./logs/web-error.log",
      out_file: "./logs/web-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
