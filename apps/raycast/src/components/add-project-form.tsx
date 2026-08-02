import { EditProjectForm, type EditProjectFormValues } from "./edit-project-form";

export type AddProjectFormValues = EditProjectFormValues;

type AddProjectFormProps = {
  defaultCloneDirectory?: string;
  onSubmit: (values: AddProjectFormValues) => Promise<boolean>;
};

export function AddProjectForm({ defaultCloneDirectory, onSubmit }: AddProjectFormProps) {
  return (
    <EditProjectForm
      navigationTitle="Add New Project"
      submitTitle="Add Repository"
      description="Add a new repository to the project list."
      initialValues={{
        name: "",
        description: "",
        iconColor: "",
        startupCommand: "",
        url: "",
        tags: "",
        folders: [],
        subpaths: "",
      }}
      defaultCloneDirectory={defaultCloneDirectory}
      fields={{ name: true, description: true, url: true, tags: true, folders: true, subpaths: true }}
      onSubmit={onSubmit}
    />
  );
}
