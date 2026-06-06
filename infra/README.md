# WhiskyApp Azure Infrastructure (Bicep)

This directory contains the Infrastructure as Code (IaC) files for deploying the WhiskyApp Azure resources using Bicep.

## File Structure

```
infra/
├── main.bicep                    # Subscription-scoped entry point, creates RG + calls modules
├── modules/
│   ├── cosmosdb.bicep            # Cosmos DB account, DB, 3 containers
│   └── staticwebapp.bicep        # SWA resource + app settings
├── parameters/
│   ├── dev.bicepparam
│   └── prod.bicepparam
└── README.md                     # Manual deploy instructions + secret setup guide

.github/workflows/infra-deploy.yml   # Manual-trigger workflow (workflow_dispatch)
```

## Prerequisites

1. Install [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. Install [Bicep CLI](https://docs.microsoft.com/en-us/azure/azure-resource-manager/bicep/install)
3. Login to Azure: `az login`

## First-time Deployment

1. Create a service principal for deployment:
   ```bash
   az ad sp create-for-rbac --name "whiskyapp-deploy" --role Contributor --scopes /subscriptions/{subscription-id}
   ```
   Save the output JSON - it will be used as the `AZURE_CREDENTIALS` GitHub secret.

2. Deploy the infrastructure:
   ```bash
   # For development environment
   az deployment sub create \
     --name "whiskyapp-infra-dev" \
     --location northeurope \
     --template-file infra/main.bicep \
     --parameters infra/parameters/dev.bicepparam \
     --parameters cosmosKey=""
   
   # For production environment
   az deployment sub create \
     --name "whiskyapp-infra-prod" \
     --location northeurope \
     --template-file infra/main.bicep \
     --parameters infra/parameters/prod.bicepparam \
     --parameters cosmosKey=""
   ```

3. Retrieve the Cosmos DB key after deployment:
   ```bash
   # For development environment
   az cosmosdb keys list \
     --name cosmos-whiskyapp-dev \
     --resource-group rg-whiskyapp \
     --query primaryMasterKey \
     --output tsv
   
   # For production environment
   az cosmosdb keys list \
     --name cosmos-whiskyapp-prod \
     --resource-group rg-whiskyapp \
     --query primaryMasterKey \
     --output tsv
   ```

4. Retrieve the SWA deployment token:
   ```bash
   # For development environment
   az staticwebapp secrets list \
     --name swa-whiskyapp-dev \
     --resource-group rg-whiskyapp \
     --query properties.apiKey \
     --output tsv
   
   # For production environment
   az staticwebapp secrets list \
     --name swa-whiskyapp-prod \
     --resource-group rg-whiskyapp \
     --query properties.apiKey \
     --output tsv
   ```

## Required GitHub Secrets

- `AZURE_CREDENTIALS` - Service principal JSON from step 1
- `COSMOS_KEY` - Cosmos DB primary key (retrieved in step 3)

## Manual Configuration Steps

After infrastructure deployment, the following steps must be completed manually:

1. Configure Google OAuth identity provider on SWA (via Azure Portal)
2. Assign admin roles via Azure Portal
3. Store the SWA deployment token as `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub

## Parameter Files

- `dev.bicepparam` - Parameters for the development environment
- `prod.bicepparam` - Parameters for the production environment

Both files use placeholders for the repository URL and require the Cosmos DB key to be provided at deployment time.