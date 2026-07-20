module.exports = {
  apps: [
    {
      name: "api-server",
      script: "./server/bin/www.js",
      // instances: "4",   //! Uncomment to enable clustering with 4 instances
      // exec_mode: "cluster", //! Uncomment to enable clustering
      watch: false,  // Disable watch for production
      autorestart: true,   // Auto-restart on crash
      max_restarts: 10,    // Max restarts within the time frame
      restart_delay: 5000, // Delay between restarts
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};