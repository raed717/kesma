import { Workspace } from "@/features/workspace/workspace";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  return <Workspace projectId={id} />;
}
