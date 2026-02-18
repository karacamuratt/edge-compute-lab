import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
    scenarios: {
        smoke: {
            executor: "constant-vus",
            vus: 5,
            duration: "30s",
        },
        load: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "30s", target: 20 },
                { duration: "60s", target: 50 },
                { duration: "30s", target: 0 },
            ],
            gracefulRampDown: "10s",
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.01"],
        http_req_duration: ["p(95)<1200"],
    },
};

const BASE_URL = __ENV.BASE_URL;
const API_KEY = __ENV.API_KEY;

export default function () {
    const url = `${BASE_URL}/api/products`;
    const params = {
        headers: {
            "x-api-key": API_KEY,
        },
    };

    const res = http.get(url, params);

    check(res, {
        "status is 200": (r) => r.status === 200,
        "has trace header": (r) => !!r.headers["X-Trace-Id"] || !!r.headers["x-trace-id"],
    });

    sleep(0.2);
}
