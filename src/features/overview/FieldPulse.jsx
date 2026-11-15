import { ArrowUpRight } from "lucide-react";

// Operational counts, never invented crop health or a synthetic confidence score.
export default function FieldPulse({ fields, tasks, onNavigate }) {
  const done = tasks.filter(task => task.done).length;
  const total = tasks.length;
  const ratio = total ? done / total : 0;
  const groups = Object.entries(fields.reduce((all, field) => {
    const crop = field.crop || "Ürün belirtilmedi";
    all[crop] = (all[crop] || 0) + 1;
    return all;
  }, Object.create(null))).sort((a,b) => b[1]-a[1]);
  return <section className="field-pulse" aria-label="İşletmenin ritmi">
    <div className="pulse-heading"><span>İŞLETMENİN RİTMİ</span><h2>Küçük adımlar.<br/>Büyüyen bir gelecek.</h2><p>Parselleriniz ve saha çalışmalarınız, bir bakışta.</p></div>
    <button className="pulse-progress" onClick={() => onNavigate("tasks")} aria-label={`Saha görevleri: ${total} görevden ${done} tamamlandı`}>
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="49"/><circle className="pulse-arc" cx="60" cy="60" r="49" pathLength="100" strokeDasharray={`${ratio*100} 100`} style={{opacity:ratio ? 1 : 0}}/><text x="60" y="61">{total ? Math.round(ratio*100)+"%" : "—"}</text><text className="pulse-ring-label" x="60" y="78">tamamlandı</text></svg>
      <span><strong>Sahada ilerleme</strong><small>{total ? `${done} tamamlanan · ${total-done} bekleyen` : "Henüz görev kaydı yok"}</small></span><ArrowUpRight size={16}/>
    </button>
    <div className="pulse-crops"><div><strong>Parsellerde ne var?</strong><button onClick={() => onNavigate("fields")} aria-label="Parselleri incele"><ArrowUpRight size={18}/></button></div>
      {groups.length ? <ul>{groups.slice(0,4).map(([crop,count]) => <li key={crop}><span>{crop}</span><b>{count} parsel</b><i><span style={{width:`${count/fields.length*100}%`}}/></i></li>)}</ul> : <p>İlk parselinizi eklediğinizde ürün dağılımınız burada görünür.</p>}
      {groups.length>4 && <small>Diğer {groups.length-4} ürün grubu Parseller ekranında.</small>}
    </div>
  </section>;
}
