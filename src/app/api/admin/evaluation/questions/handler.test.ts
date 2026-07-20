import { describe, it, expect, vi } from "vitest";
import {
  listQuestionsResponse,
  createQuestionResponse,
  updateQuestionResponse,
  deleteQuestionResponse,
} from "./handler";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "a1", role: "admin", isSuperAdmin: false }));

const json = (b: unknown, method = "POST") =>
  new Request("http://x/api/admin/evaluation/questions", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  });

const question = {
  id: "q1",
  question: "What is X?",
  expectedDocumentIds: ["d1"],
  referenceAnswer: null,
  createdAt: new Date(0),
};

describe("admin guard", () => {
  it("403s a forbidden (non-admin) caller and does not touch the repo", async () => {
    const forbidden = vi.fn(async () => { throw new ForbiddenError(); });
    const listQuestions = vi.fn(async () => [question]);
    const res = await listQuestionsResponse({ getAdmin: forbidden as never, repo: { listQuestions } as never });
    expect(res.status).toBe(403);
    expect(listQuestions).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller and does not touch the repo", async () => {
    const unauthorized = vi.fn(async () => { throw new UnauthorizedError(); });
    const createQuestion = vi.fn(async () => ({ id: "q2" }));
    const res = await createQuestionResponse(json({ question: "Q?", expectedDocumentIds: [] }), {
      getAdmin: unauthorized as never,
      repo: { createQuestion } as never,
    });
    expect(res.status).toBe(401);
    expect(createQuestion).not.toHaveBeenCalled();
  });
});

describe("listQuestionsResponse", () => {
  it("returns the questions", async () => {
    const listQuestions = vi.fn(async () => [question]);
    const res = await listQuestionsResponse({ getAdmin: admin as never, repo: { listQuestions } as never });
    expect(res.status).toBe(200);
    expect((await res.json()).questions).toHaveLength(1);
  });
});

describe("createQuestionResponse", () => {
  it("201s with the new id", async () => {
    const createQuestion = vi.fn(async () => ({ id: "q2" }));
    const res = await createQuestionResponse(
      json({ question: "What is X?", expectedDocumentIds: ["d1", "d2"], referenceAnswer: "X is Y" }),
      { getAdmin: admin as never, repo: { createQuestion } as never },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "q2" });
    expect(createQuestion).toHaveBeenCalledWith({
      question: "What is X?",
      expectedDocumentIds: ["d1", "d2"],
      referenceAnswer: "X is Y",
    });
  });

  it("stores a null referenceAnswer when absent", async () => {
    const createQuestion = vi.fn(async () => ({ id: "q3" }));
    const res = await createQuestionResponse(json({ question: "Q?", expectedDocumentIds: [] }), {
      getAdmin: admin as never,
      repo: { createQuestion } as never,
    });
    expect(res.status).toBe(201);
    expect(createQuestion).toHaveBeenCalledWith({ question: "Q?", expectedDocumentIds: [], referenceAnswer: null });
  });

  it("stores a null referenceAnswer when it is an empty string", async () => {
    const createQuestion = vi.fn(async () => ({ id: "q4" }));
    const res = await createQuestionResponse(json({ question: "Q?", expectedDocumentIds: [], referenceAnswer: "  " }), {
      getAdmin: admin as never,
      repo: { createQuestion } as never,
    });
    expect(res.status).toBe(201);
    expect(createQuestion).toHaveBeenCalledWith({ question: "Q?", expectedDocumentIds: [], referenceAnswer: null });
  });

  it("400s on an empty question", async () => {
    const res = await createQuestionResponse(json({ question: "   ", expectedDocumentIds: [] }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("400s when question is missing", async () => {
    const res = await createQuestionResponse(json({ expectedDocumentIds: [] }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("400s when expectedDocumentIds is not an array", async () => {
    const res = await createQuestionResponse(json({ question: "Q?", expectedDocumentIds: "d1" }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("400s when expectedDocumentIds contains non-strings", async () => {
    const res = await createQuestionResponse(json({ question: "Q?", expectedDocumentIds: [1, 2] }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("400s on invalid JSON", async () => {
    const req = new Request("http://x/api/admin/evaluation/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await createQuestionResponse(req, { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });
});

describe("updateQuestionResponse", () => {
  it("updates and returns ok", async () => {
    const updateQuestion = vi.fn(async () => true);
    const res = await updateQuestionResponse(
      "q1",
      json({ question: "Updated?", expectedDocumentIds: ["d1"], referenceAnswer: "Yes" }, "PATCH"),
      { getAdmin: admin as never, repo: { updateQuestion } as never },
    );
    expect(res.status).toBe(200);
    expect(updateQuestion).toHaveBeenCalledWith("q1", {
      question: "Updated?",
      expectedDocumentIds: ["d1"],
      referenceAnswer: "Yes",
    });
  });

  it("404s on an unknown question", async () => {
    const updateQuestion = vi.fn(async () => false);
    const res = await updateQuestionResponse("nope", json({ question: "Q?", expectedDocumentIds: [] }, "PATCH"), {
      getAdmin: admin as never,
      repo: { updateQuestion } as never,
    });
    expect(res.status).toBe(404);
  });

  it("400s on bad input", async () => {
    const res = await updateQuestionResponse("q1", json({ question: "", expectedDocumentIds: [] }, "PATCH"), {
      getAdmin: admin as never,
    });
    expect(res.status).toBe(400);
  });
});

describe("deleteQuestionResponse", () => {
  it("deletes and returns ok", async () => {
    const deleteQuestion = vi.fn(async () => true);
    const res = await deleteQuestionResponse("q1", { getAdmin: admin as never, repo: { deleteQuestion } as never });
    expect(res.status).toBe(200);
    expect(deleteQuestion).toHaveBeenCalledWith("q1");
  });

  it("404s on an unknown question", async () => {
    const deleteQuestion = vi.fn(async () => false);
    const res = await deleteQuestionResponse("nope", { getAdmin: admin as never, repo: { deleteQuestion } as never });
    expect(res.status).toBe(404);
  });
});
