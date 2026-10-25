"""
Business logic lives here — NOT in the routers.

Routers should stay thin: validate input, call a service function, return the
result. The real work (calculations, multi-step workflows, talking to external
systems, the SLA countdown, compliance scoring, etc.) belongs in services so it
is testable and reusable.

Convention: one file per domain, e.g. app/services/consent_service.py.
"""
