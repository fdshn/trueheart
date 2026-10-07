import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bảng tổng của `ROADMAP.md` phải khớp với chính danh sách bên dưới nó.
 *
 * ## Vì sao cần một phép kiểm cho một bảng markdown
 *
 * Ngày 02/10 một đợt đối chiếu SRS ↔ mã nguồn đổi mười mục trong các danh sách của
 * `ROADMAP.md` sang `[x]`. **Không ai sửa bảng tổng ở đầu file.** Nên tới 07/10 bảng
 * vẫn ghi M5 `⬜ 0/10` trong khi chín mục của M5 đã `[x]` cách đó năm chục dòng, và
 * ghi M6 `1/18` trong khi đếm được 11. Cột "số chức năng" cũng lệch hai dòng: M2 còn
 * tính F20 (đã bỏ khỏi phạm vi), M4 chưa tính F83.
 *
 * Năm ngày, không ai thấy. Và đây không phải một lỗi vô hại về trình bày: bảng là thứ
 * người ta đọc để biết còn bao nhiêu việc, nên một bảng nói M5 chưa làm gì là một
 * bảng mời người khác làm lại M5.
 *
 * Repo này đã có biên bản về cái giá của tài liệu lạc hậu: 25/09, tin
 * `GIVE-RECEIVE-FLOW.md` §H4 ghi "chưa có rule nào" mà không đọc mã, một migration
 * seed thêm mã rule thứ ba và **người tặng được trả thưởng hai lần** — xem
 * `1793400000000`. Dòng kết của mục đó: "tài liệu lạc hậu tệ hơn không có tài liệu".
 *
 * ## Phép kiểm này canh gì
 *
 * Nó KHÔNG đọc trạng thái thật của mã nguồn — không phép kiểm văn bản nào làm được
 * việc đó, và `srs-traceability.spec.ts` mới là chỗ đối chiếu với mã. Nó canh đúng
 * một điều hẹp hơn mà máy làm được còn người thì quên: **hai chỗ trong CÙNG một file
 * nói cùng một con số.** Đổi một checkbox mà không sửa bảng là đỏ, và ngược lại.
 */
const RoadmapPath = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'plan',
  'ROADMAP.md',
);

interface IMilestoneTally {
  /** Mã F riêng biệt, vì F65 từng chiếm hai dòng cho hai việc. */
  featureIds: Set<string>;
  /** Số DÒNG checkbox của mỗi mã, để bắt một mã có hai ô. */
  lineCountById: Map<string, number>;
  done: number;
  partial: number;
  open: number;
}

interface ITableRow {
  declaredCount: number;
  declaredDone: number | null;
  declaredTotal: number | null;
}

const Roadmap = readFileSync(RoadmapPath, 'utf-8');
const Lines = Roadmap.split('\n');

/** Đếm checkbox theo từng mốc, gom theo mã F chứ không theo DÒNG. */
function tallyChecklists(): Map<string, IMilestoneTally> {
  const tally = new Map<string, IMilestoneTally>();
  let current: string | null = null;

  for (const line of Lines) {
    const heading = /^## (M[0-9])\b/.exec(line);
    if (heading) {
      current = heading[1];
      tally.set(current, {
        featureIds: new Set(),
        lineCountById: new Map(),
        done: 0,
        partial: 0,
        open: 0,
      });
      continue;
    }
    // Mục "Việc bắt buộc, chưa nằm trong 72 chức năng" nằm NGOÀI mọi mốc và cố ý
    // không có mã F — nên nó phải ra khỏi phạm vi đếm, không được dính vào M6.
    if (/^## /.test(line)) {
      current = null;
      continue;
    }
    if (current === null) continue;

    const box = /^- \[([x~ ])\]/.exec(line);
    if (!box) continue;
    const entry = tally.get(current) as IMilestoneTally;
    const featureId = /F[0-9]{2}/.exec(line);
    // Chỉ mã F tính vào mẫu số. Ba dòng hạ tầng không mã F ở M6 là việc thật,
    // nhưng bảng tổng đếm theo "số chức năng", nên trộn vào là lệch mẫu số.
    if (!featureId) continue;
    entry.featureIds.add(featureId[0]);
    entry.lineCountById.set(
      featureId[0],
      (entry.lineCountById.get(featureId[0]) ?? 0) + 1,
    );
    if (box[1] === 'x') entry.done += 1;
    else if (box[1] === '~') entry.partial += 1;
    else entry.open += 1;
  }

  return tally;
}

/** Đọc cột "số chức năng" và con số `a/b` trong cột trạng thái của bảng tổng. */
function readSummaryTable(): Map<string, ITableRow> {
  const rows = new Map<string, ITableRow>();

  for (const line of Lines) {
    const row =
      /^\|\s*\[?(M[0-9])\]?[^|]*\|([^|]*)\|\s*([0-9—-]+)\s*\|(.*)\|\s*$/.exec(
        line,
      );
    if (!row) continue;
    const count = Number.parseInt(row[3], 10);
    if (!Number.isFinite(count)) continue;
    const fraction = /([0-9]+)\/([0-9]+)/.exec(row[4]);
    rows.set(row[1], {
      declaredCount: count,
      declaredDone: fraction ? Number(fraction[1]) : null,
      declaredTotal: fraction ? Number(fraction[2]) : null,
    });
  }

  return rows;
}

describe('ROADMAP.md tự nhất quán', () => {
  const checklists = tallyChecklists();
  const table = readSummaryTable();

  it('bảng tổng có dòng cho mọi mốc có danh sách', () => {
    expect([...checklists.keys()].sort()).toEqual([...table.keys()].sort());
  });

  it.each([...checklists.keys()].sort())(
    '%s · cột "số chức năng" khớp số mã F đếm được',
    (milestone) => {
      const counted = (checklists.get(milestone) as IMilestoneTally).featureIds
        .size;
      const declared = (table.get(milestone) as ITableRow).declaredCount;
      expect({ milestone, declared }).toEqual({
        milestone,
        declared: counted,
      });
    },
  );

  it.each([...checklists.keys()].sort())(
    '%s · con số a/b trong cột trạng thái khớp checkbox',
    (milestone) => {
      const counts = checklists.get(milestone) as IMilestoneTally;
      const row = table.get(milestone) as ITableRow;
      if (row.declaredDone === null) return;

      // Mẫu số là tổng mã F. Tử số là số mục ĐÃ XONG — `[~]` cố ý KHÔNG tính,
      // vì làm một nửa mà đếm như đã xong là cách M6 từng tự báo cáo sai.
      expect({
        milestone,
        done: row.declaredDone,
        total: row.declaredTotal,
      }).toEqual({
        milestone,
        done: counts.done,
        total: counts.featureIds.size,
      });
    },
  );

  it('tiêu đề file khớp tổng số mã F của mọi mốc', () => {
    const total = [...checklists.values()].reduce(
      (sum, entry) => sum + entry.featureIds.size,
      0,
    );
    const declared = /\*\*([0-9]+)\*\* chức năng chia 6 mốc/.exec(Roadmap);

    expect(declared).not.toBeNull();
    expect(Number((declared as RegExpExecArray)[1])).toBe(total);
  });

  it('mã đã bỏ khỏi phạm vi KHÔNG còn checkbox nào', () => {
    // "Không tính vào mẫu số tiến độ" chỉ đúng nếu nó thật sự ra khỏi danh sách.
    // F20 bỏ 02/10 mà bảng tổng vẫn đếm nó tới 07/10, nên đây là chỗ hỏi lại.
    const dropped = [
      ...Roadmap.matchAll(
        /^\| (F[0-9]{2})[^|]*\| [0-9]{2}\/[0-9]{2}\/[0-9]{4} \|/gm,
      ),
    ].map((match) => match[1]);
    expect(dropped.length).toBeGreaterThan(0);

    const stillListed = dropped.filter((id) =>
      [...checklists.values()].some((entry) => entry.featureIds.has(id)),
    );
    expect(stillListed).toEqual([]);
  });

  it('mỗi mã F có ĐÚNG MỘT checkbox', () => {
    // F65 từng có hai dòng `[ ]` cách nhau mười dòng trong M6, cho hai việc ở hai
    // trạng thái khác nhau — nên không dòng nào nói được trạng thái của mã đó, và
    // phép đếm `a/b` thì vô tình vẫn đúng vì mẫu số dùng mã riêng biệt. Một mã F
    // cần nhiều trạng thái thì phải tách mã, hoặc gộp về một ô `[~]` và kể rõ bên
    // trong — đó là cách F65 được xử 07/10.
    const doubled: string[] = [];
    for (const [milestone, entry] of checklists)
      for (const [id, count] of entry.lineCountById)
        if (count > 1) doubled.push(`${id} có ${count} ô trong ${milestone}`);

    expect(doubled).toEqual([]);
  });

  it('không mã F nào nằm ở hai mốc khác nhau', () => {
    const seen = new Map<string, string>();
    const duplicated: string[] = [];

    for (const [milestone, entry] of checklists)
      for (const id of entry.featureIds) {
        const earlier = seen.get(id);
        if (earlier !== undefined)
          duplicated.push(`${id} ở cả ${earlier} và ${milestone}`);
        else seen.set(id, milestone);
      }

    expect(duplicated).toEqual([]);
  });
});
