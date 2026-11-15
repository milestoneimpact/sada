-- D-362 · حالُ بناء الخطّة في D1 لا في KV.
-- قراءةُ KV من غير موضع كتابتها قد تتأخّر دقيقة، فبقيت شاشةُ «صدى يبني خطّتك» على «تنتظر» والبناءُ فشل.
-- صفٌّ لكلّ منظّمة بمفتاحها، يُكتب فوقه، ولا أبناءَ له.
CREATE TABLE plan_builds (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
