import { BookOpen, GitBranch, Map } from "lucide-react";
import type { MouseEvent } from "react";

export type MaterialsSection = "materials" | "map" | "relations";

export function MaterialsSectionNavigation(props: {
  current: MaterialsSection;
  hasUnsavedChanges?: boolean;
}) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!props.hasUnsavedChanges) return;
    if (window.confirm("当前资料有未保存修改。离开后这些修改会丢失，仍要继续吗？")) return;
    event.preventDefault();
  };
  return <nav className="materials-section-navigation" aria-label="资料工作区导航">
    <span>资料</span>
    <a href="/library" aria-current={props.current === "materials" ? "page" : undefined} onClick={navigate}><BookOpen aria-hidden="true" />资料库</a>
    <a href="/library?libraryView=map" aria-current={props.current === "map" ? "page" : undefined} onClick={navigate}><Map aria-hidden="true" />地图</a>
    <a href="/library?libraryView=relations" aria-current={props.current === "relations" ? "page" : undefined} onClick={navigate}><GitBranch aria-hidden="true" />关系</a>
  </nav>;
}
