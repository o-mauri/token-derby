.PHONY: install build test dynamodb-up dynamodb-down deploy

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

deploy:
	cd infra && npx cdk deploy --require-approval never
