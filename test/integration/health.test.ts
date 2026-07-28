import request from "supertest";
import app from "../../src/app";

describe("GET /health", () => {
  it("returns 200 with status ok and diagnostic fields", async () => {
    const response = await request(app)
      .get("/health")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("clean-earth-rag");
    expect(response.body).toHaveProperty("timestamp");
    expect(response.body).toHaveProperty("checks");
  });
});

describe("unknown route", () => {
  it("returns 404 with the { error, message } shape", async () => {
    const response = await request(app).get("/does-not-exist").expect(404);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toBe(response.body.message);
    expect(response.body).not.toHaveProperty("status");
  });
});
