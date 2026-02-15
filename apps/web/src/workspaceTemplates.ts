export type TemplateNodeKind = "heading" | "body" | "action";

export interface ComponentTemplateNode {
  nodeId: string;
  label: string;
  text: string;
  kind: TemplateNodeKind;
  baseClassName: string;
}

export interface ComponentTemplate {
  componentId: string;
  displayName: string;
  nodes: ComponentTemplateNode[];
}

export interface WorkspaceComponentInstance {
  instanceId: string;
  componentId: string;
  label: string;
}

export interface RenderableWorkspaceInstance {
  instanceId: string;
  componentId: string;
  label: string;
  templateDisplayName: string;
  nodes: ComponentTemplateNode[];
}

export const demoComponentTemplates: ComponentTemplate[] = [
  {
    componentId: "component-hero-card",
    displayName: "HeroCard",
    nodes: [
      {
        nodeId: "title",
        label: "Title",
        text: "Build faster with shared components",
        kind: "heading",
        baseClassName: "text-2xl font-semibold"
      },
      {
        nodeId: "subtitle",
        label: "Subtitle",
        text: "Deterministic rendering keeps collaboration predictable.",
        kind: "body",
        baseClassName: "text-sm"
      },
      {
        nodeId: "primary-action",
        label: "Primary action",
        text: "Start customizing",
        kind: "action",
        baseClassName: "rounded border px-3 py-1 text-sm"
      }
    ]
  },
  {
    componentId: "component-marketing-banner",
    displayName: "MarketingBanner",
    nodes: [
      {
        nodeId: "headline",
        label: "Headline",
        text: "Realtime-safe component updates",
        kind: "heading",
        baseClassName: "text-xl font-semibold"
      },
      {
        nodeId: "description",
        label: "Description",
        text: "Single-editor lock semantics with watcher visibility.",
        kind: "body",
        baseClassName: "text-sm"
      }
    ]
  }
];

export const demoWorkspaceInstances: WorkspaceComponentInstance[] = [
  {
    instanceId: "instance-hero-primary",
    componentId: "component-hero-card",
    label: "Homepage hero"
  },
  {
    instanceId: "instance-marketing-top",
    componentId: "component-marketing-banner",
    label: "Homepage top banner"
  }
];

export function resolveRenderableWorkspaceInstances(
  templates: ComponentTemplate[],
  instances: WorkspaceComponentInstance[]
): RenderableWorkspaceInstance[] {
  const templateById = new Map<string, ComponentTemplate>();

  for (const template of templates) {
    templateById.set(template.componentId, template);
  }

  const renderableInstances: RenderableWorkspaceInstance[] = [];

  for (const instance of instances) {
    const template = templateById.get(instance.componentId);

    if (template === undefined) {
      continue;
    }

    renderableInstances.push({
      instanceId: instance.instanceId,
      componentId: instance.componentId,
      label: instance.label,
      templateDisplayName: template.displayName,
      nodes: template.nodes
    });
  }

  return renderableInstances;
}
