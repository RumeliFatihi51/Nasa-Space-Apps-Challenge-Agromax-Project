import { platformFeatures, platformPages } from '../../shared/platform.js';
export const modules = [
  ['overview','Genel bakış','LayoutDashboard','green'],
  ['terra-brain','Araştırma','FlaskConical','green'],
  ['flight','Uçuş planı','Navigation','green'],
  ['architect','AgroMax Architect','LandPlot','green'],
  ['plant-studio','Bitki Tanıma','ScanLine','green'],
  ['field-studio','3D Saha Stüdyosu','LandPlot','green'],
  ['platform','Platform merkezi','Layers3','green'],
  ['fields','Parseller ve analiz','Sprout','green'],
  ...platformFeatures.filter(feature=>feature.id!=='fields').map(feature=>[feature.id,feature.title,feature.icon,feature.group==='assure'?'blue':'green']),
  ['field-insights','Anlaşılır analiz','FileCheck2','green'],
  ['history','Analiz geçmişi','History','green'],
  ['weather','Hava durumu','CloudSun','blue'],
  ['tasks','Takvim & görevler','CalendarDays','orange'],
  ['operations','Sezon ve saha','Leaf','green'],
  ['finance','Maliyet yönetimi','Wallet','purple'],
  ['reports','Raporlar','ChartNoAxesCombined','blue'],
  ['notifications','Bildirimler','Bell','green'],
  ['assistant','Filiz','Sprout','green'],
  ['integrations','Veri bağlantıları','Cable','purple'],
  ['settings','Hesap ve işletme','ShieldCheck','green'],
];
const legacyPages=new Set(['overview','flight','architect','field-studio','plant-studio','fields','field-insights','history','weather','tasks','notifications','assistant','integrations',...platformPages]);
export const availableModules=(commercial=false)=>commercial?modules:modules.filter(([id])=>legacyPages.has(id));
export const primaryNavigation = [
  ["overview", "Genel bakış"],
  ["fields", "Parseller"],
  ["architect", "Architect"],
  ["twin", "Dijital ikiz"],
  ["terra-brain", "Araştırma"],
  ["flight", "Uçuş planı"],
  ["tasks", "Saha"],
  ["assistant", "Filiz"],
];
export const workspaceSections = [
  {id:"fields", label:"Parseller", pages:["fields","field-insights","satellite","temporal","history","weather"]},
  {id:"architect", label:"Architect", pages:["architect","field-studio","intelligence","evidence","contradictions","investigation"]},
  {id:"twin", label:"Dijital ikiz", pages:["twin","scenarios","economics","finance"]},
  {id:"flight", label:"Uçuş planı", pages:["flight","drones"]},
  {id:"tasks", label:"Saha", pages:["tasks","operations","prescriptions"]},
  {id:"reports", label:"Raporlar", pages:["reports","mrv"]},
  {id:"settings", label:"İşletme", pages:["settings","integrations","access","platform"]},
];
export const workspaceSection = page => workspaceSections.find(section => section.pages.includes(page));
export const operationPages=['seasons','irrigation','nutrition','protection','soil','evaluations'];
export const canonicalPage=id=>operationPages.includes(id)?'operations':id;
