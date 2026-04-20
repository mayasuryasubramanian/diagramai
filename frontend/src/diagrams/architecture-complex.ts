const architectureComplex = `
architecture-beta
  service client(logos:chrome)[Client]
  service lb(logos:nginx)[Load Balancer]
  service gateway(logos:nginx)[API Gateway]

  service auth(logos:auth0)[Auth Service]
  service user(logos:nodejs-icon)[User Service]
  service order(logos:nodejs-icon)[Order Service]

  service db(logos:postgresql)[PostgreSQL]

  client:B --> T:lb
  lb:B --> T:gateway
  gateway:L --> R:auth
  gateway:B --> T:user
  gateway:R --> L:order
  auth:R --> L:db
  user:B --> T:db
  order:L --> R:db
`

export default architectureComplex
