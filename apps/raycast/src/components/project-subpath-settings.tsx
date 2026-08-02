import { Action, ActionPanel, Form, Icon, useNavigation } from "@raycast/api";
import { useState } from "react";
import { type ProjectSubpathSettingsValues } from "@raggle-ai/local";
import { ProjectSettingsHeader } from "./project-settings-header";

type ProjectSubpathSettingsProps = {
  projectName: string;
  projectIcon?: string;
  subpath: string;
  initialValues: ProjectSubpathSettingsValues;
  onSubmit: (values: ProjectSubpathSettingsValues) => Promise<boolean>;
};

export function ProjectSubpathSettings({
  projectName,
  projectIcon,
  subpath,
  initialValues,
  onSubmit,
}: ProjectSubpathSettingsProps) {
  const { pop } = useNavigation();
  const [allSubpath, setAllSubpath] = useState(initialValues.allSubpath);
  const [removePathFromName, setRemovePathFromName] = useState(initialValues.removePathFromName);

  async function handleSubmit() {
    if (await onSubmit({ allSubpath, removePathFromName })) {
      pop();
    }
  }

  return (
    <Form
      navigationTitle="Subpath Settings"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Subpath Settings" icon={Icon.Check} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <ProjectSettingsHeader projectName={projectName} projectIcon={projectIcon} subpath={subpath} />
      <Form.Checkbox
        id="allSubpath"
        title="All Subpaths"
        label="Make every folder inside this subpath searchable"
        value={allSubpath}
        onChange={setAllSubpath}
        info="Use this for nested folders inside a repository, such as making every client folder inside a configured clients folder searchable."
        storeValue={false}
      />
      <Form.Checkbox
        id="removePathFromName"
        title="Compact Names"
        label="Use folder names without parent path prefixes"
        value={removePathFromName}
        onChange={setRemovePathFromName}
        info="Applies to this subpath and the project results created from it."
        storeValue={false}
      />
    </Form>
  );
}
