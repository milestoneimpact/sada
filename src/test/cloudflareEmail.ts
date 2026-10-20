/** بديلُ `cloudflare:email` في الاختبار — يحفظ ما يُبنى ولا يرسل شيئا. */
export class EmailMessage {
  constructor(
    readonly from: string,
    readonly to: string,
    readonly raw: string,
  ) {}
}
