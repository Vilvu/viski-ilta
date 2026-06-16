// WARNING: This module contains DESTRUCTIVE partition-key changes from the original schema:
//   - whiskeys container:     /eventId → /id
//   - ratings container:      /whiskeyId → /eventId
//   - eventWhiskeys container: NEW (pk /eventId)
// Azure Resource Manager WILL DROP AND RECREATE any container whose partition key changes.
// This deploy assumes a GREENFIELD environment with no existing data.
// If any data exists, rename affected containers or run a migration script first.

param cosmosAccountName string
param location string
param environment string

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  tags: {
    Environment: environment
  }
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource whiskyDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'whiskyapp'
  properties: {
    resource: {
      id: 'whiskyapp'
    }
  }
}

resource eventsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: whiskyDatabase
  name: 'events'
  properties: {
    resource: {
      id: 'events'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource whiskeysContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: whiskyDatabase
  name: 'whiskeys'
  properties: {
    resource: {
      id: 'whiskeys'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource ratingsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: whiskyDatabase
  name: 'ratings'
  properties: {
    resource: {
      id: 'ratings'
      partitionKey: {
        paths: [
          '/eventId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource eventWhiskeysContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: whiskyDatabase
  name: 'eventWhiskeys'
  properties: {
    resource: {
      id: 'eventWhiskeys'
      partitionKey: {
        paths: [
          '/eventId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: whiskyDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}

output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosAccountName string = cosmosAccount.name