import { Action, ActionPanel, Form, Icon, useNavigation } from "@raycast/api";
import { useState } from "react";
import { ProjectSettingsHeader } from "./project-settings-header";

export type IndividualProjectSettingsValues = {
  allSubpath: boolean;
  removePathFromName: boolean;
};

type IndividualProjectSettingsProps = {
  projectName: string;
  projectIcon?: string;
  initialValues: IndividualProjectSettingsValues;
  onSubmit: (values: IndividualProjectSettingsValues) => Promise<boolean>;
};

export function IndividualProjectSettings({
  projectName,
  projectIcon,
  initialValues,
  onSubmit,
}: IndividualProjectSettingsProps) {
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
      navigationTitle="Project Settings"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Project Settings" icon={Icon.Check} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <ProjectSettingsHeader projectName={projectName} projectIcon={projectIcon} />
      <Form.Checkbox
        id="allSubpath"
        title="All Subpaths"
        label="Make every top-level folder in this repository searchable"
        value={allSubpath}
        onChange={setAllSubpath}
        info="Hidden folders and common build/dependency folders are skipped."
        storeValue={false}
      />
      <Form.Checkbox
        id="removePathFromName"
        title="Compact Names"
        label="Use folder names without parent path prefixes"
        value={removePathFromName}
        onChange={setRemovePathFromName}
        info="Applies to configured folders and subpath results."
        storeValue={false}
      />
    </Form>
  );
}
