.PHONY: install build build-site build-admin test dynamodb-up dynamodb-down bootstrap deploy _deploy-site deploy-staging destroy destroy-staging smoke-api publish-cli announce-release

# AWS profile for all deployment targets. Override with: make deploy AWS_PROFILE=other
AWS_PROFILE ?= personal

install:
	npm install

build:
	npm run build

build-site:
	npm run build --workspace=@token-derby/site

build-admin:
	npm run build --workspace=@token-derby/admin

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

deploy:
	AWS_PROFILE=$(AWS_PROFILE) node scripts/release.mjs site

# Internal: build + deploy without a version bump (invoked by release.mjs).
# Builds admin as well as site: cdk deploy uploads admin/dist from disk, so
# skipping it ships whatever stale bundle happens to be there.
_deploy-site: build-site build-admin
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk deploy --require-approval never

destroy:
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk destroy

# Deploy the staging stack (token-derby-staging.mauricode.co.uk). Builds site first.
deploy-staging: build-site build-admin
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk deploy -c env=staging --require-approval never

destroy-staging:
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk destroy -c env=staging

# Run end-to-end smoke test against the deployed API
smoke-api:
	@bash scripts/smoke-api.sh

# Bump the CLI version, record a changelog entry, then publish to npm.
publish-cli:
	node scripts/release.mjs cli

# Re-send a release announcement (e.g. after a failed post-publish Slack call).
announce-release:
	@test -n "$(COMPONENT)" -a -n "$(VERSION)" || (echo "usage: make announce-release COMPONENT=<cli|site> VERSION=<x.y.z>" && exit 1)
	node scripts/announce.mjs $(COMPONENT) $(VERSION)
