.PHONY: start stop restart logs status migrate seed backup restore test lint worker-logs scheduler-logs
start:
	docker compose up -d --build
stop:
	docker compose down
restart:
	docker compose restart
logs:
	docker compose logs -f --tail=200
status:
	docker compose ps
migrate:
	docker compose run --rm bootstrap npm run db:migrate
seed:
	docker compose run --rm bootstrap npm run db:seed
backup:
	docker compose exec postgres sh /scripts/backup.sh
restore:
	docker compose exec postgres sh /scripts/restore.sh $(FILE)
test:
	docker compose run --rm bootstrap npm test
lint:
	docker compose run --rm bootstrap npm run lint
worker-logs:
	docker compose logs -f worker
scheduler-logs:
	docker compose logs -f scheduler
