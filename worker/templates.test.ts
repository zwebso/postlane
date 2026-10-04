import { describe, expect, it } from "vitest";
import { escapeHtml, readTemplateVariables, renderTemplate, templateVariableNames, unsafeTemplateHtml } from "../shared/templates";

describe("email templates", () => {
  it("fills named variables and leaves unknown tokens", () => {
    expect(renderTemplate("Hi {{first_name}} — {{order_id}}", { first_name: "Alex" })).toBe("Hi Alex — {{order_id}}");
  });

  it("escapes values placed in HTML", () => {
    expect(renderTemplate("<p>{{name}}</p>", { name: "<b>Alex</b>" }, "html")).toBe(`<p>${escapeHtml("<b>Alex</b>")}</p>`);
  });

  it("lists the tokens a template needs", () => {
    expect(templateVariableNames("{{first_name}}", "<a href='{{action_url}}'>{{first_name}}</a>")).toEqual(["first_name", "action_url"]);
  });

  it("rejects script and event-handler markup", () => {
    expect(unsafeTemplateHtml("<p>Hello</p>")).toBe(false);
    expect(unsafeTemplateHtml("<script>alert(1)</script>")).toBe(true);
    expect(unsafeTemplateHtml('<img src="x" onerror="alert(1)">')).toBe(true);
  });

  it("accepts plain variable values", () => {
    expect(readTemplateVariables({ first_name: "Alex", amount: 20 })).toEqual({
      ok: true,
      variables: { first_name: "Alex", amount: "20" },
    });
    expect(readTemplateVariables({ first_name: { bad: true } }).ok).toBe(false);
  });
});
