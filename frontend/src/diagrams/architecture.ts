const architecture = `
architecture-beta
  service browser(logos:chrome)[Browser]
  service gateway(logos:nginx)[API Gateway]
  service backend(logos:nodejs-icon)[Backend Service]
  service db(logos:postgresql)[Database]

  browser:B --> T:gateway
  gateway:B --> T:backend
  backend:B --> T:db
`

export default architecture
