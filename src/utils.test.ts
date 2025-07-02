import { describe, expect, it, vi } from "vitest";
import { debug } from "./utils.ts";

describe("utils", () => {
	describe("debug", () => {
		it("should call console.error with provided arguments", () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			debug("test message", { data: "value" }, 123);

			expect(consoleSpy).toHaveBeenCalledWith(
				"test message",
				{ data: "value" },
				123,
			);

			consoleSpy.mockRestore();
		});

		it("should handle multiple arguments", () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const testArgs = ["arg1", "arg2", { key: "value" }, 42, true];
			debug(...testArgs);

			expect(consoleSpy).toHaveBeenCalledWith(...testArgs);

			consoleSpy.mockRestore();
		});

		it("should handle no arguments", () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			debug();

			expect(consoleSpy).toHaveBeenCalledWith();

			consoleSpy.mockRestore();
		});
	});
});
