export class MdmError extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
    readonly status = 400,
    readonly field?: string,
  ) {
    super(message);
    this.name = "MdmError";
  }

  toJson() {
    return this.field
      ? { code: this.errorCode, message: this.message, field: this.field }
      : { code: this.errorCode, message: this.message };
  }
}
