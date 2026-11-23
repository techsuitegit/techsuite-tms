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

  /** Router and logs read `code`; the constructor argument is `errorCode`. */
  get code() {
    return this.errorCode;
  }

  toJson() {
    return this.field
      ? { code: this.errorCode, message: this.message, field: this.field }
      : { code: this.errorCode, message: this.message };
  }
}
