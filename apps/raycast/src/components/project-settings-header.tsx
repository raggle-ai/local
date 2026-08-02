import { Form } from "@raycast/api";

type ProjectSettingsHeaderProps = {
  projectName: string;
  projectIcon?: string;
  subpath?: string;
};

export function ProjectSettingsHeader({ projectName, projectIcon, subpath }: ProjectSettingsHeaderProps) {
  return (
    <>
      {projectIcon ? (
        <Form.Dropdown id="project" title="Project" value={projectName} storeValue={false}>
          <Form.Dropdown.Item value={projectName} title={projectName} icon={projectIcon} />
        </Form.Dropdown>
      ) : (
        <Form.Description title="Project" text={projectName} />
      )}
      {subpath ? <Form.Description title="Subpath" text={subpath} /> : null}
      <Form.Separator />
    </>
  );
}
