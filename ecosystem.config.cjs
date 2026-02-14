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
  ],
};
