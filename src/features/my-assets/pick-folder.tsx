import { Button, Input, Modal } from "antd";
import { Folder } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { DEFAULT_FOLDER_PATH, normalizeFolderPath } from "./folder-path";
import { listRegisteredFolders, mergeFolderLists, registerFolder } from "./folder-registry";

export type PickAssetFolderOptions = {
    title?: string;
    confirmText?: string;
    defaultFolder?: string;
    extraFolders?: string[];
};

type Resolver = {
    resolve: (folder: string | null) => void;
    options: PickAssetFolderOptions;
};

let hostSetter: ((resolver: Resolver | null) => void) | null = null;

export function pickAssetFolder(options: PickAssetFolderOptions = {}): Promise<string | null> {
    return new Promise((resolve) => {
        if (!hostSetter) {
            resolve(options.defaultFolder || DEFAULT_FOLDER_PATH);
            return;
        }
        hostSetter({ resolve, options });
    });
}

export function AssetFolderPickerHost(props: { knownFolders?: string[] }) {
    const { t } = useTranslation();
    const [active, setActive] = useState<Resolver | null>(null);
    const [selected, setSelected] = useState(DEFAULT_FOLDER_PATH);
    const [newName, setNewName] = useState("");
    const [registryTick, setRegistryTick] = useState(0);

    useEffect(() => {
        hostSetter = setActive;
        return () => {
            hostSetter = null;
        };
    }, []);

    useEffect(() => {
        if (!active) return;
        setSelected(normalizeFolderPath(active.options.defaultFolder) || DEFAULT_FOLDER_PATH);
        setNewName("");
    }, [active]);

    const folders = useMemo(
        () => mergeFolderLists(listRegisteredFolders(), props.knownFolders || [], active?.options.extraFolders || []),
        [active, props.knownFolders, registryTick],
    );

    const close = (folder: string | null) => {
        active?.resolve(folder);
        setActive(null);
    };

    return (
        <Modal
            title={active?.options.title || t("canvas.assetManager.title")}
            open={Boolean(active)}
            onCancel={() => close(null)}
            footer={
                <>
                    <Button onClick={() => close(null)}>{t("common.cancel")}</Button>
                    <Button
                        type="primary"
                        onClick={() => {
                            close(registerFolder(selected));
                        }}
                    >
                        {active?.options.confirmText || t("common.save")}
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                {folders.map((folder) => (
                    <button
                        key={folder}
                        type="button"
                        className={cn("flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm", selected === folder && "border-stone-900 dark:border-stone-100")}
                        onClick={() => setSelected(folder)}
                    >
                        <Folder className="size-4" />
                        <span>{folder}</span>
                    </button>
                ))}
                <div className="flex gap-2">
                    <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={t("canvas.assetManager.title")} />
                    <Button
                        onClick={() => {
                            const folder = registerFolder(newName);
                            setRegistryTick((value) => value + 1);
                            setSelected(folder);
                            setNewName("");
                        }}
                    >
                        {t("common.save")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
