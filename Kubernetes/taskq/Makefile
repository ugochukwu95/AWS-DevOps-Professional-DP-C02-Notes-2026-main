CLUSTER  := taskq
IMAGE    := taskq:dev
NS       := taskq
PG       := taskq-pg
LOCAL_DB := postgres://taskq:taskq@localhost:5432/taskq?sslmode=disable
# docker: Postgres container outside the cluster (weeks 1-5). cluster: StatefulSet (week 6 onward).
PG_MODE  ?= docker

.PHONY: help cluster-up cluster-down pg-up pg-down pg-endpoint psql build load deploy redeploy \
        reset run-api run-worker logs status

help:
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

cluster-up: ## Create the 3-node kind cluster
	kind create cluster --config kind-config.yaml
	kubectl config use-context kind-$(CLUSTER)

cluster-down: ## Delete the kind cluster (Postgres container survives)
	kind delete cluster --name $(CLUSTER)

pg-up: ## Start Postgres in Docker on the kind network
	docker network inspect kind >/dev/null 2>&1 || docker network create kind
	docker start $(PG) 2>/dev/null || docker run -d --name $(PG) --network kind -p 5432:5432 \
		-e POSTGRES_USER=taskq -e POSTGRES_PASSWORD=taskq -e POSTGRES_DB=taskq \
		-v taskq-pgdata:/var/lib/postgresql/data postgres:17

pg-down: ## Remove the Postgres container (data stays in the taskq-pgdata volume)
	docker rm -f $(PG)

pg-endpoint: ## Point the in-cluster postgres Service at the Docker container's IP
	@IP=$$(docker inspect -f '{{(index .NetworkSettings.Networks "kind").IPAddress}}' $(PG)); \
	echo "postgres -> $$IP"; \
	sed "s/PG_IP/$$IP/" k8s/postgres-external.yaml.tmpl | kubectl apply -f -

psql: ## Open psql in the Postgres container
	docker exec -it $(PG) psql -U taskq

build: ## Build the image
	docker build -t $(IMAGE) .

load: ## Copy the image into every kind node
	kind load docker-image $(IMAGE) --name $(CLUSTER)

deploy: ## Apply the plain manifests (PG_MODE=docker|cluster)
	kubectl apply -f k8s/00-namespace.yaml
ifeq ($(PG_MODE),cluster)
	kubectl apply -f k8s/postgres-statefulset/
else
	$(MAKE) pg-endpoint
endif
	kubectl apply -f k8s/

redeploy: build load ## Rebuild, reload and restart pods with the new image
	kubectl -n $(NS) rollout restart deploy/api deploy/worker
	kubectl -n $(NS) rollout status deploy/api

reset: cluster-down cluster-up pg-up build load deploy ## Recreate everything from scratch

run-api: ## Run the api on your Mac (week 1)
	DATABASE_URL='$(LOCAL_DB)' go run ./cmd/api

run-worker: ## Run the worker on your Mac (week 1)
	DATABASE_URL='$(LOCAL_DB)' go run ./cmd/worker

logs: ## Follow api and worker logs
	kubectl -n $(NS) logs -f -l app.kubernetes.io/part-of=taskq --all-containers --prefix --max-log-requests 10

status: ## Pods, endpoints and recent events
	kubectl -n $(NS) get pods -o wide
	kubectl -n $(NS) get endpointslices
	kubectl -n $(NS) get events --sort-by=.lastTimestamp | tail -15
