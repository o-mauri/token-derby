.PHONY: install build test dynamodb-up dynamodb-down bootstrap deploy-api destroy-api smoke-api

# AWS profile for all deployment targets. Override with: make deploy-api AWS_PROFILE=other
AWS_PROFILE ?= personal

install:
	npm install

build:
	npm run build

test:
	npm test

dynamodb-up:
	docker compose up -d dynamodb
	@echo "DynamoDB Local is running on http://localhost:8000"

dynamodb-down:
	docker compose down

# One-time per account: bootstrap CDK in eu-west-2 AND us-east-1 (cert needs us-east-1)
bootstrap:
	@ACCOUNT=$$(AWS_PROFILE=$(AWS_PROFILE) aws sts get-caller-identity --query Account --output text); \
	echo "Bootstrapping account $$ACCOUNT (profile: $(AWS_PROFILE))"; \
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk bootstrap aws://$$ACCOUNT/eu-west-2 aws://$$ACCOUNT/us-east-1

deploy-api:
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk deploy --require-approval never

destroy-api:
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk destroy

# Run end-to-end smoke test against the deployed API
smoke-api:
	@bash scripts/smoke-api.sh
