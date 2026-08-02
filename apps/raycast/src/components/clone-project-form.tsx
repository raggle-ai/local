import { Action, ActionPanel, Form, Icon, useNavigation } from "@raycast/api";
import path from "node:path";
import { deriveLocalProjectPath } from "@raggle-ai/local";
import { projectTitle } from "../lib/project";
import { type Project } from "../lib/project-store";

export type CloneProjectFormValues = {
  clonePath: string;
};

type CloneProjectFormProps = {
  item: Project & {
    repositoryRoot?: string;
    remoteUrl?: string;
  };
  defaultCloneDirectory?: string;
  onSubmit: (values: CloneProjectFormValues) => Promise<boolean>;
};

export function CloneProjectForm({ item, defaultCloneDirectory, onSubmit }: CloneProjectFormProps) {
  const { pop } = useNavigation();
  const initialClonePath =
    item.repositoryRoot ?? deriveLocalProjectPath(item.remoteUrl ?? "", defaultCloneDirectory, projectTitle(item));

  async function handleSubmit(values: CloneProjectFormValues) {
    if (await onSubmit(values)) {
      pop();
    }
  }

  return (
    <Form
      navigationTitle="Clone Repository"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Clone Repository" icon={Icon.Download} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Clone Repository" text="Choose where this repository should be cloned." />
      <Form.Separator />
      <Form.TextField
        id="clonePath"
        title="Local Path"
        defaultValue={initialClonePath}
        placeholder={defaultCloneDirectory ? path.join(defaultCloneDirectory, "repository") : "repository"}
        info="Clone destination. Change the final folder name before cloning."
        storeValue={false}
      />
    </Form>
  );
}
