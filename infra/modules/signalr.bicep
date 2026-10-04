param signalrName string
param location string
// Free_F1: 20 concurrent connections, 20k messages/day. Only ONE Free
// instance is allowed per subscription, so a second environment in the same
// subscription must use Standard_S1.
@allowed([
  'Free_F1'
  'Standard_S1'
])
param sku string = 'Free_F1'
param environment string

resource signalr 'Microsoft.SignalRService/signalR@2023-02-01' = {
  name: signalrName
  location: location
  sku: {
    name: sku
    capacity: 1
  }
  kind: 'SignalR'
  tags: {
    Environment: environment
  }
  properties: {
    features: [
      {
        // Serverless: no hub server; the Functions API pushes messages over
        // the REST API and clients connect directly with negotiated tokens.
        flag: 'ServiceMode'
        value: 'Serverless'
      }
    ]
    cors: {
      // Negotiate is auth-gated on the API and tokens are short-lived, so the
      // service itself accepts any origin (avoids a SWA <-> SignalR cycle).
      allowedOrigins: [
        '*'
      ]
    }
  }
}

output signalrName string = signalr.name
